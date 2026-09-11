-- M3 — Automação
-- Núcleo do motor de automação no banco: `emit_domain_event()` é o único
-- caminho de escrita em `domain_events`, e é responsável por, na MESMA
-- transação da mudança de dado que a originou (CLAUDE.md §11):
--   1. gravar o domain_event;
--   2. enfileirar uma `automation_run` ('pending') para cada `automation`
--      ativa do pipe cujo `trigger_event` bate com o evento;
--   3. enfileirar um `job` ('automation_run') para cada run criada, para
--      que `/api/automations/process` tenha o que processar.
--
-- DECISÃO DE DESIGN (documentada, CLAUDE.md pede consistência): a
-- avaliação de `conditions` NÃO acontece aqui. Ela é feita no momento do
-- PROCESSAMENTO da run (`src/server/services/automation-processor.ts`,
-- reutilizando `evaluateConditions()` de `automation-engine.ts`), contra o
-- estado ATUAL do card (não o estado no instante do evento). Motivo: se a
-- condição fosse avaliada aqui, a lógica de operadores (`equals`,
-- `contains`, etc.) precisaria existir duas vezes — em SQL e em
-- TypeScript — com risco real de divergência. Mantendo uma única
-- implementação (TypeScript, testada em `tests/unit/automation-engine.test.ts`)
-- como fonte de verdade, a run só é marcada 'skipped' depois de reavaliar
-- as condições no processamento.
--
-- PREVENÇÃO DE LOOPS (nível banco): `causation_id` encadeia eventos
-- disparados por uma automação (ver `move_card_internal()` na migration
-- seguinte) até o evento que os causou. Antes de enfileirar novas runs,
-- percorremos essa cadeia (CTE recursiva, limitada a 25 saltos) — se a
-- profundidade alcançar 20, o evento ainda é gravado (auditoria), mas
-- NENHUMA automation_run nova é criada a partir dele. Isso limita
-- explicitamente cascatas automação -> evento -> automação -> evento...
-- Eventos causados diretamente por uma ação humana (`causation_id` nulo)
-- nunca acumulam profundidade, então esse limite jamais afeta uso normal.
-- A segunda camada de prevenção de loop (comparação de estado — não mover
-- um card para a fase em que ele já está) fica em
-- `src/server/services/automation-engine.ts::resolveActions()`.

create or replace function public.emit_domain_event(
  p_pipe_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_causation_id uuid default null,
  p_correlation_id uuid default null
)
returns public.domain_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_event public.domain_events;
  v_automation record;
  v_run_id uuid;
  v_causation_depth integer;
begin
  v_org_id := public.pipe_organization_id(p_pipe_id);
  if v_org_id is null then
    raise exception 'Pipe inexistente para emissão de evento de domínio.';
  end if;

  if p_causation_id is not null then
    with recursive chain as (
      select id, causation_id, 1 as depth
      from public.domain_events
      where id = p_causation_id
      union all
      select de.id, de.causation_id, chain.depth + 1
      from public.domain_events de
      join chain on de.id = chain.causation_id
      where chain.depth < 25
    )
    select max(depth) into v_causation_depth from chain;
  end if;

  insert into public.domain_events (
    organization_id, event_type, entity_type, entity_id, payload,
    correlation_id, causation_id, created_by
  ) values (
    v_org_id, p_event_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_correlation_id, gen_random_uuid()), p_causation_id, auth.uid()
  )
  returning * into v_event;

  if coalesce(v_causation_depth, 0) >= 20 then
    -- Proteção contra loop: evento registrado para auditoria, mas nenhuma
    -- automation_run é enfileirada a partir dele. Ver comentário no topo
    -- do arquivo.
    return v_event;
  end if;

  for v_automation in
    select id from public.automations
    where pipe_id = p_pipe_id
      and trigger_event = p_event_type
      and is_active = true
  loop
    v_run_id := null;

    insert into public.automation_runs (automation_id, domain_event_id, status, idempotency_key)
    values (
      v_automation.id,
      v_event.id,
      'pending',
      v_event.id::text || ':' || v_automation.id::text
    )
    on conflict (automation_id, idempotency_key) do nothing
    returning id into v_run_id;

    if v_run_id is not null then
      insert into public.jobs (job_type, payload, status)
      values ('automation_run', jsonb_build_object('automation_run_id', v_run_id), 'pending');
    end if;
  end loop;

  return v_event;
end;
$$;

comment on function public.emit_domain_event(uuid, text, text, uuid, jsonb, uuid, uuid) is
  'Único caminho de escrita em domain_events. Grava o evento e, na mesma transação, enfileira automation_runs (pending) + jobs para as automations ativas do pipe cujo trigger_event bate. Não avalia conditions aqui (ver comentário no topo do arquivo) e corta a cadeia de causation_id em 20 saltos para prevenir loops.';

-- Função interna: nunca deve ser chamada diretamente por um client comum
-- (nem autenticado). É invocada apenas por outras funções SECURITY DEFINER
-- (que rodam como o dono, com privilégio implícito) e pelo endpoint
-- /api/automations/process via service role, para as funções de
-- verificação periódica abaixo.
revoke all on function public.emit_domain_event(uuid, text, text, uuid, jsonb, uuid, uuid) from public;

-- ---------------------------------------------------------------------
-- check_overdue_cards() / check_sla_exceeded(): eventos que dependem de
-- tempo passando, não de um trigger de escrita. CLAUDE.md pede
-- "processamento assíncrono" — aqui, mesmo racional de "sem cron real"
-- documentado em jobs.sql: estas funções SECURITY DEFINER existem para
-- serem chamadas periodicamente por um processo externo (ex.: Vercel Cron
-- futuro chamando /api/automations/process, que por sua vez chama estas
-- funções via service role) — não há infraestrutura de cron implementada
-- aqui, apenas o mecanismo idempotente de verificação.
--
-- Deduplicação: cada função evita emitir o mesmo evento para o mesmo
-- card/fase mais de uma vez no mesmo dia, checando se já existe um
-- domain_event equivalente criado a partir de `date_trunc('day', now())`.
-- ---------------------------------------------------------------------

create or replace function public.check_overdue_cards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card record;
  v_count integer := 0;
begin
  for v_card in
    select c.id, c.pipe_id, c.due_date
    from public.cards c
    where c.due_date is not null
      and c.due_date < now()
      and c.is_archived = false
      and c.is_done = false
      and not exists (
        select 1
        from public.domain_events de
        where de.entity_id = c.id
          and de.event_type = 'card.overdue'
          and de.created_at >= date_trunc('day', now())
      )
  loop
    perform public.emit_domain_event(
      v_card.pipe_id,
      'card.overdue',
      'card',
      v_card.id,
      jsonb_build_object('due_date', v_card.due_date)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.check_overdue_cards() is
  'Verificação periódica (sem cron real — ver jobs.sql) que emite domain_events card.overdue para cards com due_date vencido, no máximo um por card por dia. Chamada apenas via service role (route /api/automations/process).';

create or replace function public.check_sla_exceeded()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card record;
  v_count integer := 0;
begin
  for v_card in
    select c.id, c.pipe_id, c.current_phase_id, ph.sla_hours
    from public.cards c
    join public.phases ph on ph.id = c.current_phase_id
    where ph.sla_hours is not null
      and c.is_archived = false
      and c.is_done = false
      and c.updated_at + (ph.sla_hours || ' hours')::interval < now()
      and not exists (
        select 1
        from public.domain_events de
        where de.entity_id = c.id
          and de.event_type = 'phase.sla.exceeded'
          and de.created_at >= date_trunc('day', now())
          and (de.payload ->> 'phase_id') = c.current_phase_id::text
      )
  loop
    perform public.emit_domain_event(
      v_card.pipe_id,
      'phase.sla.exceeded',
      'card',
      v_card.id,
      jsonb_build_object('phase_id', v_card.current_phase_id, 'sla_hours', v_card.sla_hours)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.check_sla_exceeded() is
  'Verificação periódica (sem cron real — ver jobs.sql) que emite domain_events phase.sla.exceeded para cards cuja fase atual excedeu phases.sla_hours (contado a partir de cards.updated_at, mesma convenção de getSlaStatus() em src/lib/validation/cards.ts), no máximo um por card/fase por dia. Chamada apenas via service role.';

revoke all on function public.check_overdue_cards() from public;
grant execute on function public.check_overdue_cards() to service_role;

revoke all on function public.check_sla_exceeded() from public;
grant execute on function public.check_sla_exceeded() to service_role;

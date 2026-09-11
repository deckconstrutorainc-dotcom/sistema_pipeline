-- M7 — Ecosystem
-- Estende `emit_domain_event()` (M3, `20260818091600_automation_engine_functions.sql`)
-- para, na MESMA transação em que o domain_event é gravado, também
-- enfileirar entregas de webhook outbound — mesmo racional de
-- "persistir evento antes de processar automação" (CLAUDE.md §11) aplicado
-- a webhooks: nunca dependemos de uma segunda escrita separada que possa
-- falhar/ficar inconsistente com o evento.
--
-- DECISÃO DE DESIGN (reaproveita a fila de `jobs` do M3, não duplica
-- mecanismo): para cada webhook outbound ativo da organização (e, se
-- `webhooks.pipe_id` estiver preenchido, restrito àquele pipe) cujo
-- `event_types` contenha o `event_type` emitido, insere uma
-- `webhook_deliveries` ('pending', `idempotency_key` =
-- `domain_event_id || ':' || webhook_id`, mesmo padrão de
-- `automation_runs`) e um `jobs` (`job_type = 'webhook_delivery'`,
-- payload `{ webhook_delivery_id }`). `POST /api/automations/process`
-- processa esse `job_type` com o mesmo `dequeue_jobs()` genérico já usado
-- para `automation_run` — nenhuma função SQL nova de fila foi necessária.
--
-- É uma REDEFINIÇÃO COMPLETA da função (mesma assinatura), preservando
-- 100% do corpo original (prevenção de loop por profundidade de
-- causation_id, enfileiramento de automation_runs) e adicionando o bloco
-- de webhooks ao final, antes do `return`. A prevenção de loop por
-- profundidade também protege webhooks (mesmo corte em 20 saltos) — evita
-- que uma cascata automação->evento->automação também inunde um endpoint
-- externo de webhook.

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
  v_webhook record;
  v_run_id uuid;
  v_delivery_id uuid;
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
    -- automation_run/webhook_delivery é enfileirada a partir dele. Ver
    -- comentário no topo do arquivo.
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

  -- M7: enfileira entregas de webhook outbound ativos da organização cujo
  -- event_types contenha este evento — escopados ao pipe quando
  -- webhooks.pipe_id estiver preenchido, ou à organização inteira quando
  -- nulo.
  for v_webhook in
    select id from public.webhooks
    where organization_id = v_org_id
      and direction = 'outbound'
      and is_active = true
      and (pipe_id is null or pipe_id = p_pipe_id)
      and event_types @> array[p_event_type]
  loop
    v_delivery_id := null;

    insert into public.webhook_deliveries (
      webhook_id, domain_event_id, direction, payload, status, idempotency_key
    ) values (
      v_webhook.id,
      v_event.id,
      'outbound',
      jsonb_build_object(
        'event_type', v_event.event_type,
        'entity_type', v_event.entity_type,
        'entity_id', v_event.entity_id,
        'payload', v_event.payload,
        'occurred_at', v_event.created_at
      ),
      'pending',
      v_event.id::text || ':' || v_webhook.id::text
    )
    on conflict (webhook_id, idempotency_key) do nothing
    returning id into v_delivery_id;

    if v_delivery_id is not null then
      insert into public.jobs (job_type, payload, status)
      values ('webhook_delivery', jsonb_build_object('webhook_delivery_id', v_delivery_id), 'pending');
    end if;
  end loop;

  return v_event;
end;
$$;

comment on function public.emit_domain_event(uuid, text, text, uuid, jsonb, uuid, uuid) is
  'Único caminho de escrita em domain_events. Grava o evento e, na mesma transação, enfileira automation_runs + jobs (M3) E webhook_deliveries outbound + jobs (M7) para automations/webhooks ativos que casam com o evento. Corta a cadeia de causation_id em 20 saltos para prevenir loops (afeta ambos os enfileiramentos).';

revoke all on function public.emit_domain_event(uuid, text, text, uuid, jsonb, uuid, uuid) from public;

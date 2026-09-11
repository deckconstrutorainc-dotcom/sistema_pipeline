-- M3 — Automação
-- Conecta `move_card` (M2) ao motor de automação, substituindo o
-- `-- TODO M3: enfileirar automações via domain_events` da migration
-- `20260818091000_move_card_rpc.sql` por uma chamada real a
-- `emit_domain_event()`.
--
-- Para viabilizar isso SEM quebrar a assinatura nem o comportamento já
-- testado de `public.move_card(uuid, uuid)` (usada pelo client autenticado
-- via `src/server/actions/cards.ts`), a lógica é dividida em duas funções:
--
--   - `move_card_internal(...)`: contém a lógica de negócio completa
--     (passos 2-8 de CLAUDE.md §10 — a única diferença é que quem chama
--     decide se a checagem de `is_pipe_member` roda ou não, e fornece
--     explicitamente o `actor_id` a gravar em `card_activities`, em vez de
--     depender de `auth.uid()`). Bloqueada para clients: só `service_role`
--     tem `EXECUTE` (ver grants no fim do arquivo).
--   - `move_card(uuid, uuid)`: mantém EXATAMENTE a mesma assinatura,
--     mensagens de erro e comportamento observável de antes (autentica via
--     `auth.uid()`, exige `is_pipe_member`), e apenas delega para
--     `move_card_internal()` com `p_actor_id := auth.uid()`,
--     `p_require_membership := true`, `p_causation_event_id := null`
--     (movimentação humana direta é sempre raiz de uma nova cadeia de
--     causação, nunca causada por outro evento).
--
-- Isso permite que `src/server/services/automation-processor.ts` (rodando
-- com o client admin/service role, sem sessão de usuário e portanto sem
-- `auth.uid()`) reaproveite a MESMA lógica de movimentação — em vez de
-- duplicá-la — passando `p_actor_id := automations.created_by` (atribui a
-- movimentação, para fins de auditoria, ao administrador que configurou a
-- automação) e `p_causation_event_id := <domain_event que disparou a run>`
-- (encadeia a causação para a proteção de loop em `emit_domain_event()`).

create or replace function public.move_card_internal(
  p_card_id uuid,
  p_target_phase_id uuid,
  p_actor_id uuid,
  p_require_membership boolean default true,
  p_causation_event_id uuid default null
)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards;
  v_target_phase public.phases;
  v_missing_field_label text;
  v_result public.cards;
begin
  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Card não encontrado.';
  end if;

  if p_require_membership and not public.is_pipe_member(v_card.pipe_id) then
    raise exception 'Sem permissão para mover cards neste pipe.';
  end if;

  if v_card.is_archived then
    raise exception 'Não é possível mover um card arquivado.';
  end if;

  select * into v_target_phase from public.phases where id = p_target_phase_id;
  if v_target_phase.id is null or v_target_phase.pipe_id <> v_card.pipe_id then
    raise exception 'Fase de destino inválida para este pipe.';
  end if;

  if p_target_phase_id = v_card.current_phase_id then
    raise exception 'O card já está nesta fase.';
  end if;

  select f.label into v_missing_field_label
  from public.phase_fields pf
  join public.fields f on f.id = pf.field_id
  left join public.card_field_values cfv
    on cfv.card_id = v_card.id and cfv.field_id = pf.field_id
  where pf.phase_id = v_card.current_phase_id
    and pf.is_required = true
    and f.is_archived = false
    and (
      cfv.value is null
      or cfv.value = 'null'::jsonb
      or cfv.value = '""'::jsonb
      or cfv.value = '[]'::jsonb
    )
  limit 1;

  if v_missing_field_label is not null then
    raise exception 'Campo obrigatório não preenchido: %', v_missing_field_label;
  end if;

  perform set_config('bts.allow_phase_change', 'true', true);

  update public.cards
    set current_phase_id = p_target_phase_id,
        is_done = v_target_phase.is_final,
        updated_at = now()
    where id = v_card.id
    returning * into v_result;

  insert into public.card_activities (card_id, actor_id, type, payload)
  values (
    v_card.id,
    p_actor_id,
    'phase_changed',
    jsonb_build_object(
      'from_phase_id', v_card.current_phase_id,
      'to_phase_id', p_target_phase_id
    )
  );

  perform public.emit_domain_event(
    v_card.pipe_id,
    'card.moved',
    'card',
    v_card.id,
    jsonb_build_object('from_phase_id', v_card.current_phase_id, 'to_phase_id', p_target_phase_id),
    p_causation_event_id
  );

  return v_result;
end;
$$;

comment on function public.move_card_internal(uuid, uuid, uuid, boolean, uuid) is
  'Lógica de negócio completa de movimentação de card (CLAUDE.md §10), reutilizada tanto por move_card() (usuário autenticado) quanto por automation-processor.ts (automação, via service role). NUNCA conceder EXECUTE a authenticated/anon: não faz a checagem de auth.uid() — quem chama decide o ator e se a checagem de is_pipe_member roda.';

revoke all on function public.move_card_internal(uuid, uuid, uuid, boolean, uuid) from public;
grant execute on function public.move_card_internal(uuid, uuid, uuid, boolean, uuid) to service_role;

-- `move_card(uuid, uuid)`: mesma assinatura e comportamento de
-- `20260818091000_move_card_rpc.sql`, agora delegando para
-- move_card_internal(). create or replace preserva o OID da função, então
-- o grant/revoke original continua valendo, mas repetimos por clareza.
create or replace function public.move_card(p_card_id uuid, p_target_phase_id uuid)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  return public.move_card_internal(
    p_card_id,
    p_target_phase_id,
    auth.uid(),
    true,
    null
  );
end;
$$;

comment on function public.move_card(uuid, uuid) is
  'Movimentação transacional de card entre fases (CLAUDE.md §10): autentica via auth.uid() e delega a lógica de negócio para move_card_internal() (ver comentário no topo desta migration). Mesma assinatura e comportamento observável desde M2 — apenas passou a emitir domain_event card.moved (dentro de move_card_internal) em vez do TODO original.';

revoke all on function public.move_card(uuid, uuid) from public;
grant execute on function public.move_card(uuid, uuid) to authenticated;

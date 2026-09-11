-- M3 — Automação
-- Triggers que emitem domain_events a partir de mutações do Workflow Core
-- (M2) já existentes: criação de card e alteração de valor de campo.
-- `card.moved` é tratado à parte, dentro de `move_card()` (ver próxima
-- migration), porque não existe trigger de UPDATE genérico em cards para
-- mudança de fase — `current_phase_id` só muda dentro dessa função.

create or replace function public.emit_card_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_domain_event(
    new.pipe_id,
    'card.created',
    'card',
    new.id,
    jsonb_build_object('title', new.title, 'phase_id', new.current_phase_id, 'number', new.number)
  );
  return new;
end;
$$;

comment on function public.emit_card_created_event() is
  'Emite domain_event card.created após INSERT em cards, enfileirando automation_runs para automations ativas do pipe com trigger_event = card.created (ver emit_domain_event()).';

drop trigger if exists emit_card_created_event_trigger on public.cards;
create trigger emit_card_created_event_trigger
  after insert on public.cards
  for each row
  execute function public.emit_card_created_event();

-- ---------------------------------------------------------------------
-- card_field_values: dispara em INSERT sempre, e em UPDATE somente quando
-- o valor efetivamente mudou (evita ruído/eventos vazios quando um upsert
-- é feito com o mesmo valor já existente).
-- ---------------------------------------------------------------------

create or replace function public.emit_card_field_updated_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipe_id uuid;
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;

  select pipe_id into v_pipe_id from public.cards where id = new.card_id;
  if v_pipe_id is null then
    return new;
  end if;

  perform public.emit_domain_event(
    v_pipe_id,
    'card.field.updated',
    'card',
    new.card_id,
    jsonb_build_object('field_id', new.field_id, 'value', new.value)
  );
  return new;
end;
$$;

comment on function public.emit_card_field_updated_event() is
  'Emite domain_event card.field.updated após INSERT/UPDATE em card_field_values (só quando o valor muda), enfileirando automation_runs para automations ativas com trigger_event = card.field.updated.';

drop trigger if exists emit_card_field_updated_event_trigger on public.card_field_values;
create trigger emit_card_field_updated_event_trigger
  after insert or update on public.card_field_values
  for each row
  execute function public.emit_card_field_updated_event();

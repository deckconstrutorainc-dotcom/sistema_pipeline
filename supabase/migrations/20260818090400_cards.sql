-- M2 — Workflow Core
-- `cards`: item de trabalho dentro de um pipe.
--
-- Número sequencial: gerado por card POR PIPE (não globalmente) via trigger
-- `assign_card_number`, que incrementa `pipes.next_card_number` com um
-- `UPDATE ... RETURNING` — o lock de linha implícito do UPDATE em
-- `pipes` serializa inserções concorrentes de cards no mesmo pipe, evitando
-- colisão de número sem depender de uma sequence global do Postgres (que
-- não daria numeração reiniciada por pipe).
--
-- `current_phase_id` só pode ser alterado pela função `move_card()` — ver
-- trigger `enforce_card_phase_change_trigger` na migration de RLS/policies,
-- que bloqueia UPDATE direto via PostgREST fora dessa RPC.

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  current_phase_id uuid not null references public.phases (id) on delete restrict,
  number integer not null,
  title text not null,
  due_date timestamptz,
  is_archived boolean not null default false,
  is_done boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_title_not_blank check (btrim(title) <> ''),
  constraint cards_number_positive check (number > 0),
  constraint cards_pipe_number_unique unique (pipe_id, number)
);

comment on table public.cards is
  'Item de trabalho dentro de um pipe. current_phase_id só muda via RPC move_card() (ver enforce_card_phase_change_trigger).';

create index if not exists cards_pipe_id_idx
  on public.cards (pipe_id);

create index if not exists cards_current_phase_id_idx
  on public.cards (current_phase_id);

create index if not exists cards_created_by_idx
  on public.cards (created_by);

drop trigger if exists set_cards_updated_at on public.cards;
create trigger set_cards_updated_at
  before update on public.cards
  for each row
  execute function public.set_updated_at();

alter table public.cards enable row level security;

-- ---------------------------------------------------------------------
-- Numeração sequencial por pipe.
-- ---------------------------------------------------------------------

create or replace function public.assign_card_number()
returns trigger
language plpgsql
as $$
declare
  v_next integer;
begin
  if new.number is null then
    update public.pipes
      set next_card_number = next_card_number + 1
      where id = new.pipe_id
      returning next_card_number into v_next;

    if v_next is null then
      raise exception 'Pipe inexistente para geração do número do card.';
    end if;

    new.number := v_next - 1;
  end if;

  return new;
end;
$$;

comment on function public.assign_card_number() is
  'Atribui number sequencial por pipe usando pipes.next_card_number. O UPDATE em pipes serializa inserções concorrentes via lock de linha, garantindo unicidade sem sequence global.';

drop trigger if exists assign_card_number_trigger on public.cards;
create trigger assign_card_number_trigger
  before insert on public.cards
  for each row
  execute function public.assign_card_number();

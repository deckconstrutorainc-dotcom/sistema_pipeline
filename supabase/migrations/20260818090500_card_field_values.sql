-- M2 — Workflow Core
-- `card_field_values`: valor de cada campo dinâmico para cada card.
-- `value jsonb` guarda o valor no formato adequado ao tipo do campo (string,
-- number, boolean, array de strings para multi_select, etc.) — validado na
-- camada de aplicação (src/lib/validation/fields.ts) antes de gravar, já
-- que o Postgres não valida o formato interno de um jsonb genérico.

create table if not exists public.card_field_values (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint card_field_values_unique unique (card_id, field_id)
);

comment on table public.card_field_values is
  'Valor de um campo dinâmico para um card específico. Um card nunca ganha coluna física nova por campo criado pelo usuário (CLAUDE.md §8).';

create index if not exists card_field_values_card_id_idx
  on public.card_field_values (card_id);

create index if not exists card_field_values_field_id_idx
  on public.card_field_values (field_id);

drop trigger if exists set_card_field_values_updated_at on public.card_field_values;
create trigger set_card_field_values_updated_at
  before update on public.card_field_values
  for each row
  execute function public.set_updated_at();

alter table public.card_field_values enable row level security;

-- Garante que o campo pertence ao mesmo pipe do card.
create or replace function public.check_card_field_value_same_pipe()
returns trigger
language plpgsql
as $$
declare
  v_card_pipe_id uuid;
  v_field_pipe_id uuid;
begin
  select pipe_id into v_card_pipe_id from public.cards where id = new.card_id;
  select pipe_id into v_field_pipe_id from public.fields where id = new.field_id;

  if v_card_pipe_id is null or v_field_pipe_id is null then
    raise exception 'Card ou campo inexistente.';
  end if;

  if v_card_pipe_id <> v_field_pipe_id then
    raise exception 'O campo deve pertencer ao mesmo pipe do card.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_card_field_value_same_pipe_trigger on public.card_field_values;
create trigger check_card_field_value_same_pipe_trigger
  before insert or update on public.card_field_values
  for each row
  execute function public.check_card_field_value_same_pipe();

-- M4 — Data Hub
-- `records`: um registro dentro de um database (linha da "planilha").
-- `title`: denormalizado para exibição rápida em listas/buscas sem juntar
-- `record_values` toda vez. Calculado no server action (`createRecord` /
-- `updateRecordFields`, ver `src/server/actions/records.ts` e a função
-- pura `resolveRecordTitle` em `src/lib/validation/databases.ts`) a partir
-- de: (1) `databases.title_field_id`, se configurado; senão (2) o primeiro
-- `database_fields` do tipo short_text/long_text não arquivado, por
-- `position`; senão (3) um fallback fixo ("Registro sem título"). Nunca
-- calculado por trigger SQL para manter a lógica testável/unitária em
-- TypeScript, igual ao restante da validação de domínio do projeto.
--
-- `record_values`: valor de cada campo dinâmico por registro — mesmo
-- padrão jsonb de `card_field_values` (CLAUDE.md §8), inclusive a
-- constraint de "mesmo database" via trigger.

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  title text not null default 'Registro sem título',
  is_archived boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.records is
  'Registro (linha) de um database. title é denormalizado a partir de record_values — ver comentário no topo do arquivo.';

create index if not exists records_database_id_idx
  on public.records (database_id);

create index if not exists records_created_by_idx
  on public.records (created_by);

drop trigger if exists set_records_updated_at on public.records;
create trigger set_records_updated_at
  before update on public.records
  for each row
  execute function public.set_updated_at();

alter table public.records enable row level security;

-- ---------------------------------------------------------------------
-- record_values
-- ---------------------------------------------------------------------

create table if not exists public.record_values (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  database_field_id uuid not null references public.database_fields (id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint record_values_unique unique (record_id, database_field_id)
);

comment on table public.record_values is
  'Valor de um campo dinâmico para um registro específico. Mesmo padrão de card_field_values (CLAUDE.md §8).';

create index if not exists record_values_record_id_idx
  on public.record_values (record_id);

create index if not exists record_values_database_field_id_idx
  on public.record_values (database_field_id);

drop trigger if exists set_record_values_updated_at on public.record_values;
create trigger set_record_values_updated_at
  before update on public.record_values
  for each row
  execute function public.set_updated_at();

alter table public.record_values enable row level security;

-- Garante que o campo pertence ao mesmo database do registro (mesmo
-- padrão de check_card_field_value_same_pipe no M2).
create or replace function public.check_record_value_same_database()
returns trigger
language plpgsql
as $$
declare
  v_record_database_id uuid;
  v_field_database_id uuid;
begin
  select database_id into v_record_database_id from public.records where id = new.record_id;
  select database_id into v_field_database_id from public.database_fields where id = new.database_field_id;

  if v_record_database_id is null or v_field_database_id is null then
    raise exception 'Registro ou campo inexistente.';
  end if;

  if v_record_database_id <> v_field_database_id then
    raise exception 'O campo deve pertencer ao mesmo database do registro.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_record_value_same_database_trigger on public.record_values;
create trigger check_record_value_same_database_trigger
  before insert or update on public.record_values
  for each row
  execute function public.check_record_value_same_database();

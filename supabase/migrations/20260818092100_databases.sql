-- M4 — Data Hub
-- `databases`: "tabela de dados" custom da organização (planilha
-- estruturada), recurso compartilhado por toda a organização — não
-- pertence a um pipe específico (diferente de `fields`, que é por pipe).
-- Usada para popular campos de card via conexão + autofill (ver
-- `card_record_connections` / `autofillFromRecord`).

create table if not exists public.databases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  icon text,
  is_archived boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint databases_name_not_blank check (btrim(name) <> '')
);

comment on table public.databases is
  'Database (tabela de dados custom) da organização — recurso compartilhado, não vinculado a um pipe específico. Base do Data Hub (M4).';

create index if not exists databases_organization_id_idx
  on public.databases (organization_id);

create index if not exists databases_created_by_idx
  on public.databases (created_by);

drop trigger if exists set_databases_updated_at on public.databases;
create trigger set_databases_updated_at
  before update on public.databases
  for each row
  execute function public.set_updated_at();

alter table public.databases enable row level security;

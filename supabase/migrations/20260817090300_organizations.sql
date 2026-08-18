-- M1 — Segurança e Tenant
-- `organizations`: raiz de todo dado multi-tenant da plataforma.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (btrim(name) <> ''),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.organizations is
  'Tenant raiz da plataforma. Todo dado de negócio pertence, direta ou indiretamente, a uma organização.';

create index if not exists organizations_created_by_idx
  on public.organizations (created_by);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

alter table public.organizations enable row level security;

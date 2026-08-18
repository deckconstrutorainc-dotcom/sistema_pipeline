-- M1 — Segurança e Tenant
-- `roles`, `permissions`, `role_permissions`: papéis fixos do sistema (não
-- editáveis por organização neste milestone) e permissões granulares
-- associadas a cada papel. Gerenciados apenas via migration/seed — nenhuma
-- policy de escrita é exposta ao client.

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z0-9_]+$')
);

comment on table public.roles is
  'Papéis fixos do sistema (Super Admin, Admin, Member, Read Only, Restricted, Guest).';

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now(),
  constraint permissions_key_format check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$')
);

comment on table public.permissions is
  'Permissões granulares reutilizáveis entre papéis (ex: organization.manage).';

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is
  'Mapeamento N:N entre papéis e permissões.';

create index if not exists role_permissions_permission_id_idx
  on public.role_permissions (permission_id);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

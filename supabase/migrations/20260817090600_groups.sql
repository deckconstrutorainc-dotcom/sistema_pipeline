-- M1 — Segurança e Tenant
-- `groups` / `group_members`: agrupamentos de usuários dentro de uma
-- organização (usados futuramente para atribuição em massa em pipes/cards).

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint groups_name_not_blank check (btrim(name) <> '')
);

comment on table public.groups is
  'Agrupamento de usuários dentro de uma organização.';

create index if not exists groups_organization_id_idx
  on public.groups (organization_id);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_members is
  'Vínculo N:N entre grupos e usuários.';

create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

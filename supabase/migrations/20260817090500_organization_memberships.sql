-- M1 — Segurança e Tenant
-- `organization_memberships`: vínculo entre usuário e organização, com papel
-- e status. É a tabela central usada pelas policies de autorização
-- multi-tenant de todo o restante do schema.

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  status text not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_status_check
    check (status in ('active', 'invited', 'removed')),
  constraint organization_memberships_org_user_unique
    unique (organization_id, user_id)
);

comment on table public.organization_memberships is
  'Vínculo usuário<->organização com papel e status. Base de toda autorização multi-tenant.';

create index if not exists organization_memberships_organization_id_idx
  on public.organization_memberships (organization_id);

create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships (user_id);

create index if not exists organization_memberships_role_id_idx
  on public.organization_memberships (role_id);

drop trigger if exists set_organization_memberships_updated_at on public.organization_memberships;
create trigger set_organization_memberships_updated_at
  before update on public.organization_memberships
  for each row
  execute function public.set_updated_at();

alter table public.organization_memberships enable row level security;

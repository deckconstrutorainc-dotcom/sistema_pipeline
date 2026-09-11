-- M6 — Gestão e Analytics
-- `interfaces` + `interface_components`: telas internas personalizadas
-- (CLAUDE.md §1/§22 — "Interfaces" no menu principal). NÃO confundir com o
-- portal público do M5 (`portals`), que é a superfície voltada a
-- requerentes EXTERNOS sem conta na organização — `interfaces` é para
-- usuários internos/convidados da própria organização montarem visões
-- próprias (embed de dashboard, visão de pipe, visão de database, texto).
--
-- `slug` é único POR ORGANIZAÇÃO (não globalmente, ao contrário de
-- `portals.slug` que vira URL pública) — a interface é acessada dentro da
-- aplicação autenticada em /interfaces/[interfaceId], o slug aqui é só um
-- identificador amigável reservado para uso futuro (ex.: link direto),
-- daí o unique composto em vez de unique global.

create table if not exists public.interfaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  slug text not null,
  is_published boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interfaces_name_not_blank check (btrim(name) <> ''),
  constraint interfaces_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint interfaces_org_slug_unique unique (organization_id, slug)
);

comment on table public.interfaces is
  'Tela interna personalizada (dashboards/visões combinadas) para uso de membros/convidados da própria organização. Distinta de portals (M5), que é a superfície pública para requerentes externos. is_published controla se a interface aparece na listagem para membros não-admin.';

create index if not exists interfaces_organization_id_idx
  on public.interfaces (organization_id);

drop trigger if exists set_interfaces_updated_at on public.interfaces;
create trigger set_interfaces_updated_at
  before update on public.interfaces
  for each row
  execute function public.set_updated_at();

alter table public.interfaces enable row level security;

-- ---------------------------------------------------------------------
-- interface_components
-- ---------------------------------------------------------------------

create table if not exists public.interface_components (
  id uuid primary key default gen_random_uuid(),
  interface_id uuid not null references public.interfaces (id) on delete cascade,
  component_type text not null,
  config jsonb not null default '{}'::jsonb,
  position_x integer not null default 0,
  position_y integer not null default 0,
  width integer not null default 6,
  height integer not null default 4,
  created_at timestamptz not null default now(),
  constraint interface_components_type_check check (
    component_type in ('dashboard_embed', 'pipe_view', 'database_view', 'text_block')
  ),
  constraint interface_components_dimensions_positive check (width > 0 and height > 0),
  constraint interface_components_position_non_negative check (position_x >= 0 and position_y >= 0)
);

comment on table public.interface_components is
  'Componente de uma interface personalizada. config jsonb varia por component_type: dashboard_embed -> {"dashboardId"}, pipe_view -> {"pipeId"}, database_view -> {"databaseId"}, text_block -> {"text"}. Validação de shape em src/lib/validation/interfaces.ts.';

create index if not exists interface_components_interface_id_idx
  on public.interface_components (interface_id);

alter table public.interface_components enable row level security;

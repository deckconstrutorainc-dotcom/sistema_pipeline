-- M6 — Gestão e Analytics
-- `dashboards` + `dashboard_widgets`: grade de widgets configuráveis.
-- Posicionamento é um grid CSS simples (position_x/position_y em "células",
-- width/height em número de células) — sem drag-and-drop nesta fase (ver
-- TODO na UI); suficiente para renderizar um layout determinístico.

create table if not exists public.dashboards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboards_name_not_blank check (btrim(name) <> '')
);

comment on table public.dashboards is
  'Dashboard configurável de uma organização, composto por dashboard_widgets. is_default marca o dashboard aberto por padrão (aplicação garante no server action, via update em duas etapas, que só um dashboard por organização tenha is_default = true).';

create index if not exists dashboards_organization_id_idx
  on public.dashboards (organization_id);

drop trigger if exists set_dashboards_updated_at on public.dashboards;
create trigger set_dashboards_updated_at
  before update on public.dashboards
  for each row
  execute function public.set_updated_at();

alter table public.dashboards enable row level security;

-- ---------------------------------------------------------------------
-- dashboard_widgets
-- ---------------------------------------------------------------------

create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  widget_type text not null,
  title text not null,
  config jsonb not null default '{}'::jsonb,
  position_x integer not null default 0,
  position_y integer not null default 0,
  width integer not null default 4,
  height integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_widgets_title_not_blank check (btrim(title) <> ''),
  constraint dashboard_widgets_type_check check (
    widget_type in ('kpi', 'bar_chart', 'line_chart', 'pie_chart', 'table', 'sla_summary')
  ),
  constraint dashboard_widgets_dimensions_positive check (width > 0 and height > 0),
  constraint dashboard_widgets_position_non_negative check (position_x >= 0 and position_y >= 0)
);

comment on table public.dashboard_widgets is
  'Widget de um dashboard. report_id nullable: widget pode referenciar um report salvo (reaproveita config dele) ou ter config própria em dashboard_widgets.config. widget_type restrito ao catálogo suportado pela UI (src/app/(app)/dashboards).';

create index if not exists dashboard_widgets_dashboard_id_idx
  on public.dashboard_widgets (dashboard_id);

create index if not exists dashboard_widgets_report_id_idx
  on public.dashboard_widgets (report_id);

drop trigger if exists set_dashboard_widgets_updated_at on public.dashboard_widgets;
create trigger set_dashboard_widgets_updated_at
  before update on public.dashboard_widgets
  for each row
  execute function public.set_updated_at();

alter table public.dashboard_widgets enable row level security;

-- Defesa em profundidade: garante que report_id (quando informado) pertence
-- à mesma organização do dashboard do widget.
create or replace function public.check_widget_report_same_org()
returns trigger
language plpgsql
as $$
declare
  v_dashboard_org_id uuid;
  v_report_org_id uuid;
begin
  if new.report_id is null then
    return new;
  end if;

  select organization_id into v_dashboard_org_id from public.dashboards where id = new.dashboard_id;
  select organization_id into v_report_org_id from public.reports where id = new.report_id;

  if v_dashboard_org_id is null then
    raise exception 'Dashboard inexistente.';
  end if;

  if v_report_org_id is null or v_report_org_id <> v_dashboard_org_id then
    raise exception 'O report do widget deve pertencer à mesma organização do dashboard.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_widget_report_same_org_trigger on public.dashboard_widgets;
create trigger check_widget_report_same_org_trigger
  before insert or update on public.dashboard_widgets
  for each row
  execute function public.check_widget_report_same_org();

-- M6 — Gestão e Analytics
-- `reports`: definição salva de um relatório (filtros, agrupamento,
-- métricas selecionadas). `pipe_id` nullable: um report pode ser
-- específico de um pipe OU cross-pipe (ex.: "todos os cards atrasados da
-- organização"), decisão explícita do enunciado do milestone.
--
-- `config jsonb`: estrutura livre e versionável (CLAUDE.md §8 — campo
-- dinâmico modelado como jsonb, não como uma coluna física por opção de
-- filtro). O shape esperado (documentado aqui, validado em
-- `src/lib/validation/reports.ts`, NUNCA confiado sem validação Zod no
-- servidor):
--   {
--     "metric": "phase_counts" | "avg_time_in_phase" | "completion_rate" | "sla_summary",
--     "phaseIds": string[] | null,   -- filtro opcional de fases
--     "dateFrom": string | null,     -- ISO date, filtro por created_at
--     "dateTo": string | null
--   }

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pipe_id uuid references public.pipes (id) on delete cascade,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_name_not_blank check (btrim(name) <> '')
);

comment on table public.reports is
  'Definição salva de um relatório (filtros/agrupamento/métricas em config jsonb). pipe_id nullable: report pode ser cross-pipe (ex.: atrasados da organização inteira) ou específico de um pipe. O resultado NUNCA é persistido aqui — é calculado sob demanda por src/server/queries/reports.ts + src/server/services/reporting.ts a partir dos dados atuais.';

create index if not exists reports_organization_id_idx
  on public.reports (organization_id);

create index if not exists reports_pipe_id_idx
  on public.reports (pipe_id);

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
  before update on public.reports
  for each row
  execute function public.set_updated_at();

alter table public.reports enable row level security;

-- Defesa em profundidade: garante que pipe_id (quando informado) pertence
-- à mesma organização do report — mesmo padrão de check_portal_pipe_same_org.
create or replace function public.check_report_pipe_same_org()
returns trigger
language plpgsql
as $$
declare
  v_pipe_org_id uuid;
begin
  if new.pipe_id is null then
    return new;
  end if;

  select organization_id into v_pipe_org_id from public.pipes where id = new.pipe_id;

  if v_pipe_org_id is null then
    raise exception 'Pipe inexistente.';
  end if;

  if v_pipe_org_id <> new.organization_id then
    raise exception 'O pipe do report deve pertencer à mesma organização do report.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_report_pipe_same_org_trigger on public.reports;
create trigger check_report_pipe_same_org_trigger
  before insert or update on public.reports
  for each row
  execute function public.check_report_pipe_same_org();

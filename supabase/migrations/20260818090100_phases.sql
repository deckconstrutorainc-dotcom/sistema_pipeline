-- M2 — Workflow Core
-- `phases`: colunas do kanban de um pipe. Ordenação por `position` (inteiro
-- gerenciado pela aplicação — sem unicidade forçada no banco para permitir
-- reordenação em lote sem colisões transitórias).
--
-- `is_initial` marca a fase onde novos cards entram por padrão; `is_final`
-- marca fase(s) de conclusão (usada por `move_card` para setar
-- `cards.is_done`). Nenhuma das duas é exclusiva a uma única fase no banco
-- (a UI/validação de domínio decide a fase inicial padrão), mas o
-- INSERT/UPDATE típico do produto mantém apenas uma fase inicial por pipe.

create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  is_initial boolean not null default false,
  is_final boolean not null default false,
  sla_hours integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phases_name_not_blank check (btrim(name) <> ''),
  constraint phases_sla_hours_positive check (sla_hours is null or sla_hours > 0)
);

comment on table public.phases is
  'Fase (coluna do kanban) de um pipe. Cards possuem exatamente uma fase atual (cards.current_phase_id).';

create index if not exists phases_pipe_id_idx
  on public.phases (pipe_id);

drop trigger if exists set_phases_updated_at on public.phases;
create trigger set_phases_updated_at
  before update on public.phases
  for each row
  execute function public.set_updated_at();

alter table public.phases enable row level security;

-- Fecha a referência circular pipes <-> phases: a fase usada como formulário
-- inicial de criação de card (opcional; null = sem formulário dedicado).
alter table public.pipes
  add column if not exists start_form_phase_id uuid references public.phases (id) on delete set null;

create index if not exists pipes_start_form_phase_id_idx
  on public.pipes (start_form_phase_id);

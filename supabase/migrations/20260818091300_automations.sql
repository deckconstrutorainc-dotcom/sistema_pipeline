-- M3 — Automação
-- `automations`: regra Evento -> Condições -> Ações configurada para um
-- pipe (CLAUDE.md §11). Escopo natural é o pipe (mesmo escopo de phases/
-- fields/labels) — `organization_id` é sempre derivável via `pipe_id`
-- (`pipe_organization_id()`, já usado pelos demais helpers de autorização
-- do workflow), então não é duplicado aqui como coluna física.
--
-- `conditions`/`actions` são jsonb: lista de condições/ações dinâmicas,
-- seguindo a mesma diretriz de CLAUDE.md §8 de não criar coluna física por
-- regra criada pelo usuário. O formato é validado na camada de aplicação
-- (`src/lib/validation/automations.ts`) antes de gravar — o Postgres não
-- valida a forma interna de um jsonb genérico.

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  name text not null,
  description text,
  trigger_event text not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automations_name_not_blank check (btrim(name) <> ''),
  constraint automations_trigger_event_check check (
    trigger_event in (
      'card.created',
      'card.moved',
      'card.field.updated',
      'card.overdue',
      'phase.sla.exceeded'
    )
  )
);

comment on table public.automations is
  'Regra de automação (Evento -> Condições -> Ações, CLAUDE.md §11) escopada a um pipe. organization_id é derivável via pipe_id (pipe_organization_id()).';

create index if not exists automations_pipe_id_idx
  on public.automations (pipe_id);

-- Índice usado pelo enfileiramento em emit_domain_event(): busca automations
-- ativas de um pipe por trigger_event a cada evento emitido.
create index if not exists automations_pipe_trigger_active_idx
  on public.automations (pipe_id, trigger_event)
  where is_active = true;

drop trigger if exists set_automations_updated_at on public.automations;
create trigger set_automations_updated_at
  before update on public.automations
  for each row
  execute function public.set_updated_at();

alter table public.automations enable row level security;

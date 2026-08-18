-- M2 — Workflow Core
-- `pipes`: processo/workflow dentro de uma organização. Raiz de todo o
-- restante do módulo (phases, fields, cards, labels...).
--
-- `is_restricted`: quando `false` (padrão), qualquer membro ativo da
-- organização pode acessar o pipe — comportamento simples e previsível para
-- o primeiro milestone. Quando `true`, apenas membros da organização com
-- papel admin/super_admin OU listados em `pipe_memberships` têm acesso (ver
-- função `is_pipe_member` na migration de helpers de autorização).
--
-- `next_card_number`: contador usado pelo trigger `assign_card_number`
-- (ver `cards.sql`) para gerar o número sequencial de cada card, sem
-- depender de uma sequence global do Postgres (o número é sequencial POR
-- PIPE, não global).
--
-- `start_form_phase_id` é adicionado apenas na migration de `phases`, via
-- `alter table`, porque referencia uma tabela criada depois (ordem de
-- criação: pipes -> phases -> fk de volta em pipes).

create table if not exists public.pipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  icon text,
  color text,
  is_restricted boolean not null default false,
  is_archived boolean not null default false,
  next_card_number integer not null default 1,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipes_name_not_blank check (btrim(name) <> ''),
  constraint pipes_next_card_number_positive check (next_card_number > 0)
);

comment on table public.pipes is
  'Processo/workflow dentro de uma organização. Raiz do módulo Workflow Core (M2).';

create index if not exists pipes_organization_id_idx
  on public.pipes (organization_id);

create index if not exists pipes_created_by_idx
  on public.pipes (created_by);

drop trigger if exists set_pipes_updated_at on public.pipes;
create trigger set_pipes_updated_at
  before update on public.pipes
  for each row
  execute function public.set_updated_at();

alter table public.pipes enable row level security;

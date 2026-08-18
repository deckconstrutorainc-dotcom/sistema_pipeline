-- M2 — Workflow Core
-- `pipe_memberships`: lista explícita de acesso a um pipe.
--
-- Decisão de modelagem: NÃO reaproveitamos `role_id` de `public.roles` aqui
-- nem criamos um catálogo de papéis por pipe. Motivo: no escopo deste
-- milestone, a granularidade de permissão relevante (quem pode gerenciar
-- estrutura do pipe vs. quem pode operar cards) já é totalmente derivada do
-- papel do usuário NA ORGANIZAÇÃO (via `has_org_role`/`is_org_member`).
-- `pipe_memberships` serve apenas para GATE DE VISIBILIDADE quando
-- `pipes.is_restricted = true`: só entra na lista quem deve enxergar aquele
-- pipe específico. Admin/super_admin da organização sempre têm acesso,
-- restrito ou não (ver função `is_pipe_member`). Se um caso de uso futuro
-- precisar de papéis por pipe (ex.: "revisor" só neste pipe), isso deve
-- virar uma nova coluna/tabela em milestone dedicado — não forçar isso
-- agora evita over-engineering prematuro (CLAUDE.md §25).

create table if not exists public.pipe_memberships (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pipe_memberships_unique unique (pipe_id, user_id)
);

comment on table public.pipe_memberships is
  'Lista explícita de acesso a um pipe restrito (pipes.is_restricted = true). Não carrega papel próprio — autorização de escrita continua vindo do papel da organização.';

create index if not exists pipe_memberships_pipe_id_idx
  on public.pipe_memberships (pipe_id);

create index if not exists pipe_memberships_user_id_idx
  on public.pipe_memberships (user_id);

alter table public.pipe_memberships enable row level security;

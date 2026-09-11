-- M2 — Workflow Core
-- `card_activities`: histórico/auditoria de um card (CLAUDE.md §18/§23).
--
-- Deliberadamente SEM policy de INSERT/UPDATE/DELETE para o role
-- `authenticated` (ver migration de RLS): o histórico não pode ser forjado
-- nem apagado pelo cliente. Toda escrita acontece exclusivamente através de
-- funções SECURITY DEFINER (`log_card_activity`, chamada pelos server
-- actions, e diretamente dentro de `move_card`), que rodam com o
-- privilégio do owner da função e por isso não são bloqueadas por essa
-- ausência de policy — a tabela continua protegida contra escrita direta
-- via PostgREST/client.

create table if not exists public.card_activities (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint card_activities_type_check check (
    type in (
      'card_created',
      'phase_changed',
      'field_updated',
      'assigned',
      'unassigned',
      'label_added',
      'label_removed',
      'comment_added',
      'attachment_added',
      'card_archived',
      'card_unarchived',
      'card_completed'
    )
  )
);

comment on table public.card_activities is
  'Histórico/auditoria de um card. actor_id nullable para permitir origem de sistema/automação (M3). Escrita somente via função SECURITY DEFINER (log_card_activity / move_card) — nunca via INSERT direto do client.';

create index if not exists card_activities_card_id_idx
  on public.card_activities (card_id, created_at desc);

alter table public.card_activities enable row level security;

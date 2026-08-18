-- M3 — Automação
-- `domain_events`: registro append-only de tudo que acontece no workflow
-- (CLAUDE.md §11: "Persistir evento antes de processar automação").
--
-- Toda automação nasce a partir de um domain_event já gravado — nunca o
-- contrário. `correlation_id` agrupa eventos da mesma "história de negócio"
-- (ex.: todos os eventos derivados da criação de um card); `causation_id`
-- aponta para o evento que causou este (nullable — null quando o evento é
-- raiz, ou seja, foi disparado diretamente por uma ação humana e não por
-- outro evento processado pelo motor de automação). Ver
-- `20260818091600_automation_engine_functions.sql` para como esses dois
-- campos são usados na prevenção de loops.
--
-- Esta tabela é escrita SOMENTE pela função SECURITY DEFINER
-- `emit_domain_event` (mesmo padrão de `card_activities`/`log_card_activity`
-- já estabelecido no M2) — nunca via INSERT direto do client.

create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid references public.domain_events (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint domain_events_event_type_check check (
    event_type in (
      'card.created',
      'card.moved',
      'card.field.updated',
      'card.overdue',
      'phase.sla.exceeded'
    )
  )
);

comment on table public.domain_events is
  'Registro append-only de eventos de domínio do workflow (CLAUDE.md §11). Fonte de verdade que dispara automation_runs. Escrita somente via SECURITY DEFINER emit_domain_event().';

create index if not exists domain_events_org_type_created_idx
  on public.domain_events (organization_id, event_type, created_at);

create index if not exists domain_events_correlation_id_idx
  on public.domain_events (correlation_id);

create index if not exists domain_events_entity_idx
  on public.domain_events (entity_type, entity_id, created_at);

alter table public.domain_events enable row level security;

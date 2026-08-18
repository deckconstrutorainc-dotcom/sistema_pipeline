-- M3 — Automação
-- `automation_runs`: uma execução (pendente/em andamento/finalizada) de uma
-- `automation` para um `domain_event` específico. É o registro de log de
-- execução exigido por CLAUDE.md §11/§25 ("Registrar automation run",
-- "Registrar sucesso, falha e motivo").
--
-- Idempotência: `unique (automation_id, idempotency_key)`. `idempotency_key`
-- é gerado de forma determinística a partir de `domain_event_id` +
-- `automation_id` (ver `emit_domain_event()`), então o MESMO evento nunca
-- cria duas runs para a mesma automação, mesmo se `emit_domain_event` for
-- chamada mais de uma vez para o mesmo evento (não deveria acontecer, mas
-- a constraint é a garantia definitiva, não a disciplina de chamada).
--
-- Retries: `attempt`/`max_attempts` — ver `automation-processor.ts` para a
-- lógica de incremento em caso de falha.

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  domain_event_id uuid not null references public.domain_events (id) on delete cascade,
  status text not null default 'pending',
  attempt integer not null default 1,
  max_attempts integer not null default 3,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint automation_runs_status_check check (
    status in ('pending', 'running', 'succeeded', 'failed', 'skipped')
  ),
  constraint automation_runs_attempt_positive check (attempt > 0),
  constraint automation_runs_max_attempts_positive check (max_attempts > 0),
  constraint automation_runs_idempotency_unique unique (automation_id, idempotency_key)
);

comment on table public.automation_runs is
  'Execução de uma automation para um domain_event. Escrita somente via SECURITY DEFINER (emit_domain_event() para criação; automation-processor.ts, via service role, para atualização de status).';

create index if not exists automation_runs_status_idx
  on public.automation_runs (status, created_at);

create index if not exists automation_runs_automation_id_idx
  on public.automation_runs (automation_id);

create index if not exists automation_runs_domain_event_id_idx
  on public.automation_runs (domain_event_id);

alter table public.automation_runs enable row level security;

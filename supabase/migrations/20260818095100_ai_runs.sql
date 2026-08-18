-- M8 — Intelligence
-- `ai_runs`: execução (ou execução pendente) de um `ai_agent` — o registro
-- central de auditoria/observabilidade da camada de IA (CLAUDE.md §17/§18:
-- "Registrar execuções" / "Registrar modelo utilizado" / "Registrar
-- uso/custo quando disponível" / "ação de IA" no histórico de auditoria).
--
-- Máquina de estados de `status`:
--   pending           -> run criada, aguardando processamento (job enfileirado)
--   running           -> processando (chamada ao provider de IA em curso)
--   awaiting_approval -> o modelo pediu uma tool 'critical' e o agente exige
--                        aprovação humana (requires_approval=true); NADA foi
--                        executado ainda para esse tool_call.
--   approved          -> humano aprovou via approve_ai_run(); reenfileirado
--                        para executar o tool_call pendente.
--   rejected          -> humano rejeitou via approve_ai_run(); TERMINAL,
--                        nada é executado.
--   succeeded         -> TERMINAL, sucesso.
--   failed            -> TERMINAL, falha (ver error_message). Ao contrário
--                        de `automation_runs`/`webhook_deliveries`, esta
--                        tabela NÃO tem retry automático (sem colunas
--                        attempt/max_attempts) — decisão deliberada:
--                        chamadas de IA têm custo monetário real, então uma
--                        falha fica visível para um humano decidir se
--                        dispara uma NOVA execução, em vez de reprocessar
--                        automaticamente e gerar custo sem supervisão.
--
-- RLS (ver `20260818095400_intelligence_rls_policies.sql`): leitura para
-- qualquer membro da organização (observabilidade — CLAUDE.md §18). ZERO
-- policy de INSERT/UPDATE/DELETE para authenticated/anon — só o
-- service_role (via `triggerAiRun`/`ai-run-processor.ts`) grava esta tabela
-- diretamente. A ÚNICA escrita disponível ao usuário autenticado é a
-- transição controlada via RPC SECURITY DEFINER `approve_ai_run` (próxima
-- migration), que só altera status/approved_by/approved_at de uma run já em
-- 'awaiting_approval' — nunca um INSERT genérico nem alteração de
-- tool_calls/output/input.
--
-- `tool_calls jsonb`: log append-only (regravado a cada update pelo
-- service_role, mas nunca editável pelo client) de cada tool chamada pelo
-- modelo + parâmetros + resultado — evidência/auditoria completa do que a
-- IA fez, inclusive tool_calls REJEITADOS por não estarem na allowlist do
-- agente (CLAUDE.md §17 "Registrar evidências quando extrair dados de
-- documentos" cobre o dado extraído em si via `ai_run_evidences`; este
-- campo cobre TODA chamada de tool).

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  ai_agent_id uuid not null references public.ai_agents (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trigger_type text not null,
  card_id uuid references public.cards (id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'pending',
  model text,
  tokens_used integer,
  cost_usd numeric(10, 4),
  tool_calls jsonb not null default '[]'::jsonb,
  error_message text,
  requested_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_runs_trigger_type_check check (
    trigger_type in ('manual', 'automation', 'card_event')
  ),
  constraint ai_runs_status_check check (
    status in (
      'pending', 'running', 'awaiting_approval', 'approved', 'rejected', 'succeeded', 'failed'
    )
  ),
  constraint ai_runs_tokens_used_non_negative check (tokens_used is null or tokens_used >= 0),
  constraint ai_runs_cost_usd_non_negative check (cost_usd is null or cost_usd >= 0)
);

comment on table public.ai_runs is
  'Execução (ou execução pendente/aguardando aprovação) de um ai_agent. Escrita exclusiva via service_role (ai-run-processor.ts) ou via RPC approve_ai_run — RLS não expõe INSERT/UPDATE/DELETE ao client. Ver comentário no topo do arquivo para a máquina de estados completa.';

create index if not exists ai_runs_organization_id_created_at_idx
  on public.ai_runs (organization_id, created_at desc);

create index if not exists ai_runs_ai_agent_id_idx
  on public.ai_runs (ai_agent_id);

create index if not exists ai_runs_card_id_idx
  on public.ai_runs (card_id) where card_id is not null;

create index if not exists ai_runs_status_idx
  on public.ai_runs (status);

-- Integridade: card_id (quando presente) deve pertencer à mesma organização
-- do run — nunca um agente de uma organização processar o card de outra.
create or replace function public.check_ai_run_card_same_org()
returns trigger
language plpgsql
as $$
declare
  v_card_org_id uuid;
begin
  if new.card_id is null then
    return new;
  end if;

  select p.organization_id into v_card_org_id
  from public.cards c
  join public.pipes p on p.id = c.pipe_id
  where c.id = new.card_id;

  if v_card_org_id is null then
    raise exception 'Card inexistente.';
  end if;

  if v_card_org_id <> new.organization_id then
    raise exception 'O card do ai_run deve pertencer à mesma organização do run.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_ai_run_card_same_org_trigger on public.ai_runs;
create trigger check_ai_run_card_same_org_trigger
  before insert or update on public.ai_runs
  for each row
  execute function public.check_ai_run_card_same_org();

alter table public.ai_runs enable row level security;

-- ---------------------------------------------------------------------
-- Enfileiramento automático: toda ai_run inserida com status='pending'
-- enfileira um job (job_type='ai_run', payload {ai_run_id}) na MESMA
-- transação do INSERT — mesmo padrão de `emit_domain_event()` (M3)
-- enfileirar automation_run. Isso garante que `triggerAiRun` (server
-- action) só precisa inserir a linha em ai_runs; o processamento
-- assíncrono real acontece via `POST /api/ai/process` (mesma fila `jobs`,
-- mesmo `CRON_SECRET` de M3/M7 — CLAUDE.md §11 "processamento
-- preferencialmente assíncrono").
-- ---------------------------------------------------------------------

create or replace function public.enqueue_ai_run_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.jobs (job_type, payload)
    values ('ai_run', jsonb_build_object('ai_run_id', new.id));
  end if;
  return new;
end;
$$;

comment on function public.enqueue_ai_run_job() is
  'Enfileira um job job_type=ai_run sempre que uma ai_run é inserida com status pending, na mesma transação (mesmo padrão de emit_domain_event() enfileirar automation_run no M3).';

drop trigger if exists enqueue_ai_run_job_trigger on public.ai_runs;
create trigger enqueue_ai_run_job_trigger
  after insert on public.ai_runs
  for each row
  execute function public.enqueue_ai_run_job();

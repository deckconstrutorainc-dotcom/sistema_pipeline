-- M3 — Automação
-- `jobs`: fila simples baseada em tabela para processamento assíncrono
-- lógico (CLAUDE.md §11: "Processamento preferencialmente assíncrono").
--
-- PENDÊNCIA DE INFRAESTRUTURA (documentada intencionalmente, fora do escopo
-- de código deste milestone): este projeto não tem worker/cron real rodando
-- em background — Next.js puro não hospeda processos de longa duração. O
-- que existe aqui é o MECANISMO de fila + processor idempotente:
--   1. Eventos de domínio enfileiram uma linha em `jobs` (job_type
--      'automation_run', payload { automation_run_id }) dentro da mesma
--      transação que gera o domain_event (`emit_domain_event()`).
--   2. `POST /api/automations/process` (Route Handler, protegido por
--      `x-cron-secret` == env `CRON_SECRET`) processa um lote de jobs
--      pendentes.
--   3. Em produção, algo precisa CHAMAR esse endpoint periodicamente — um
--      Vercel Cron Job (ou cron externo/GitHub Action/etc.) apontando para
--      essa rota com o header configurado. Configurar esse agendador é
--      responsabilidade de deploy/infra, não deste código, e não está
--      implementado aqui.
-- Sem isso, jobs ficam 'pending' indefinidamente até alguém chamar o
-- endpoint manualmente — comportamento esperado e documentado, não um bug.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_status_check check (status in ('pending', 'processing', 'succeeded', 'failed')),
  constraint jobs_attempts_non_negative check (attempts >= 0),
  constraint jobs_max_attempts_positive check (max_attempts > 0)
);

comment on table public.jobs is
  'Fila baseada em tabela para processamento assíncrono lógico das automations. Sem worker/cron real neste código — ver comentário no topo do arquivo. RLS habilitada sem nenhuma policy: inacessível a anon/authenticated, só acessível via service role (Route Handler /api/automations/process) ou funções SECURITY DEFINER que rodam como dono da tabela.';

create index if not exists jobs_status_run_at_idx
  on public.jobs (status, run_at);

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

alter table public.jobs enable row level security;

-- Nenhuma policy é criada de propósito: com RLS habilitada e zero policies,
-- a tabela fica completamente inacessível para os roles `anon` e
-- `authenticated` (nem SELECT). Apenas o role `service_role` (que faz
-- bypass de RLS) ou o dono da tabela (funções SECURITY DEFINER) conseguem
-- ler/escrever — exatamente o que CLAUDE.md exige para infraestrutura
-- interna que não deve ser exposta ao client.

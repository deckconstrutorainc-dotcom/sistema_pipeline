-- M8 — Intelligence
-- `ai_agents`: configuração de um agente de IA (CLAUDE.md §17 — camada de
-- IA desacoplada, provider substituível). Um agente é só CONFIGURAÇÃO
-- (instruções + allowlist de tools + política de aprovação) — a execução
-- de verdade fica em `ai_runs`, nunca aqui.
--
-- `allowed_tools text[]`: ALLOWLIST EXPLÍCITA das tools que este agente pode
-- chamar (nomes definidos em `src/lib/ai/tool-catalog.ts` /
-- `tool-registry.ts`). Este é o mecanismo central de "IA nunca deve acessar
-- o banco diretamente sem ferramentas e validações autorizadas" (CLAUDE.md
-- §17): o motor de execução (`ai-run-processor.ts`) SEMPRE valida um
-- tool_call retornado pelo modelo contra esta lista antes de sequer
-- considerar executá-lo — mesmo que o modelo "peça" uma tool fora da lista,
-- ela é rejeitada e registrada como tal em `ai_runs.tool_calls`, nunca
-- executada. Não existe nenhum caminho de código que confie cegamente no
-- nome de tool devolvido pelo provider de IA.
--
-- `requires_approval`: quando true (padrão — fail-safe), qualquer tool_call
-- de criticidade 'critical' fica retida em `ai_runs.status =
-- 'awaiting_approval'` até um humano aprovar via RPC `approve_ai_run`
-- (CLAUDE.md §17 "Human-in-the-loop para ações críticas quando necessário"
-- / §3.29). Tools 'read'/'write' não passam por esse portão — mas toda tool
-- 'write'/'critical' ainda revalida permissão dentro do próprio `execute()`
-- (defesa em profundidade, ver `tool-registry.ts`).
--
-- `pipe_id` nullable: um agente pode ser escopado a um pipe específico
-- (ex.: "assistente de contratos" só atua no pipe de Contratos) ou ficar
-- disponível para toda a organização quando null.

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  instructions text not null default '',
  allowed_tools text[] not null default '{}',
  pipe_id uuid references public.pipes (id) on delete set null,
  requires_approval boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agents_name_not_blank check (btrim(name) <> '')
);

comment on table public.ai_agents is
  'Configuração de um agente de IA: instruções (system prompt) + allowlist explícita de tools + política de aprovação humana para ações críticas. Nunca executa nada por si só — ver ai_runs.';

create index if not exists ai_agents_organization_id_idx
  on public.ai_agents (organization_id);

create index if not exists ai_agents_pipe_id_idx
  on public.ai_agents (pipe_id) where pipe_id is not null;

drop trigger if exists set_ai_agents_updated_at on public.ai_agents;
create trigger set_ai_agents_updated_at
  before update on public.ai_agents
  for each row
  execute function public.set_updated_at();

-- Garante que, quando informado, o pipe do agente pertence à mesma
-- organização do agente (mesmo padrão de check_phase_field_same_pipe, M2).
create or replace function public.check_ai_agent_pipe_same_org()
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
    raise exception 'O pipe do agente deve pertencer à mesma organização do agente.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_ai_agent_pipe_same_org_trigger on public.ai_agents;
create trigger check_ai_agent_pipe_same_org_trigger
  before insert or update on public.ai_agents
  for each row
  execute function public.check_ai_agent_pipe_same_org();

alter table public.ai_agents enable row level security;

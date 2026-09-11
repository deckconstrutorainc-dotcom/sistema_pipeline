-- M8 — Intelligence
-- `knowledge_sources`: base de conhecimento simples usada como contexto
-- adicional ao montar o prompt de um `ai_run` (ver
-- `src/server/services/ai-run-processor.ts`).
--
-- SIMPLIFICAÇÃO DELIBERADA (documentada — CLAUDE.md §17/§25, "a solução
-- mais simples que preserve... extensibilidade"): esta primeira versão NÃO
-- implementa embeddings/busca vetorial/semântica. `content` é usado apenas
-- para busca TEXTUAL SIMPLES (substring/keyword, ver
-- `selectRelevantKnowledge` em `src/server/services/ai-run-engine.ts`) —
-- suficiente para poucas dezenas de fontes de conhecimento curtas, mas não
-- escala nem entende sinônimos/semântica. Migrar para busca vetorial real
-- (ex.: `pgvector` + embeddings) é uma evolução natural, fora do escopo
-- deste milestone (ver PENDÊNCIA no relatório final).
--
-- `ai_agent_id` nullable: uma fonte pode ser específica de um agente ou
-- ficar disponível para qualquer agente da organização quando null.
--
-- `storage_path` (documentos) e `content` (manual_text/snapshots de
-- url/database_table) são mutuamente úteis conforme o `source_type` — a
-- validação de qual é obrigatório para cada tipo fica na camada de
-- aplicação (`src/lib/validation/ai.ts`), não em constraint de banco, para
-- manter a tabela simples e essa regra fácil de evoluir.

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ai_agent_id uuid references public.ai_agents (id) on delete set null,
  name text not null,
  source_type text not null,
  content text,
  storage_path text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_sources_name_not_blank check (btrim(name) <> ''),
  constraint knowledge_sources_source_type_check check (
    source_type in ('document', 'url', 'database_table', 'manual_text')
  )
);

comment on table public.knowledge_sources is
  'Base de conhecimento simples usada como contexto de um ai_run. Busca por TEXTO SIMPLES nesta primeira versão, não semântica/vetorial (ver comentário no topo do arquivo).';

create index if not exists knowledge_sources_organization_id_idx
  on public.knowledge_sources (organization_id);

create index if not exists knowledge_sources_ai_agent_id_idx
  on public.knowledge_sources (ai_agent_id) where ai_agent_id is not null;

drop trigger if exists set_knowledge_sources_updated_at on public.knowledge_sources;
create trigger set_knowledge_sources_updated_at
  before update on public.knowledge_sources
  for each row
  execute function public.set_updated_at();

-- Garante que, quando informado, o agente da fonte pertence à mesma
-- organização (mesmo padrão de check_ai_agent_pipe_same_org).
create or replace function public.check_knowledge_source_agent_same_org()
returns trigger
language plpgsql
as $$
declare
  v_agent_org_id uuid;
begin
  if new.ai_agent_id is null then
    return new;
  end if;

  select organization_id into v_agent_org_id from public.ai_agents where id = new.ai_agent_id;
  if v_agent_org_id is null then
    raise exception 'Agente de IA inexistente.';
  end if;

  if v_agent_org_id <> new.organization_id then
    raise exception 'O agente da fonte de conhecimento deve pertencer à mesma organização.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_knowledge_source_agent_same_org_trigger on public.knowledge_sources;
create trigger check_knowledge_source_agent_same_org_trigger
  before insert or update on public.knowledge_sources
  for each row
  execute function public.check_knowledge_source_agent_same_org();

alter table public.knowledge_sources enable row level security;

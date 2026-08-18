-- M8 — Intelligence
-- `ai_run_evidences`: rastreabilidade de onde a IA "tirou" um dado extraído
-- (CLAUDE.md §17: "Registrar evidências quando extrair dados de
-- documentos"). Uma linha por valor extraído/sugerido, ligando o `ai_run`
-- de origem ao campo do card (`card_field_id`, quando aplicável) e ao
-- trecho da fonte que embasou a extração.
--
-- Escrita exclusiva via service_role (`ai-run-processor.ts`, ao processar
-- uma tool de extração como `extract_card_fields_from_document`) — mesma
-- disciplina de `ai_runs` (ver RLS na próxima migration).
--
-- `card_field_id` referencia `public.fields` (definição de campo do pipe,
-- não `card_field_values`) — o nome reflete o vocabulário do CLAUDE.md
-- ("campo extraído"), mas o valor em si já foi gravado em
-- `card_field_values` pela própria tool; esta tabela é só a evidência/
-- justificativa, não o dado de negócio.

create table if not exists public.ai_run_evidences (
  id uuid primary key default gen_random_uuid(),
  ai_run_id uuid not null references public.ai_runs (id) on delete cascade,
  card_field_id uuid references public.fields (id) on delete set null,
  source_excerpt text not null,
  confidence numeric,
  created_at timestamptz not null default now(),
  constraint ai_run_evidences_source_excerpt_not_blank check (btrim(source_excerpt) <> ''),
  constraint ai_run_evidences_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

comment on table public.ai_run_evidences is
  'Rastreabilidade de um dado extraído/sugerido por IA: trecho da fonte + confiança, ligado ao ai_run e (quando aplicável) ao campo do card. Escrita exclusiva via service_role.';

create index if not exists ai_run_evidences_ai_run_id_idx
  on public.ai_run_evidences (ai_run_id);

create index if not exists ai_run_evidences_card_field_id_idx
  on public.ai_run_evidences (card_field_id) where card_field_id is not null;

alter table public.ai_run_evidences enable row level security;

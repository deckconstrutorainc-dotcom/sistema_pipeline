/**
 * Motor de decisão de execução de IA (CLAUDE.md §17) — mesmo espírito de
 * `automation-engine.ts` (M3): SOMENTE lógica pura (sem I/O, sem Supabase,
 * sem chamar o provider de IA), para ser testável de forma unitária e
 * determinística (`tests/unit/ai-run-processor.test.ts`). A camada com
 * efeito colateral (carregar o agente real, chamar o provider, executar
 * tools, gravar status/evidências) fica em `ai-run-processor.ts`, que
 * importa e reutiliza estas funções em vez de duplicar a lógica.
 */
import type { ToolCriticality } from "@/lib/ai/tool-catalog";

export type ToolCallOutcome = "execute" | "awaiting_approval";

/**
 * Decide se um tool_call retornado pelo modelo deve ser executado
 * imediatamente ou retido para aprovação humana (CLAUDE.md §17/§3.29
 * "Ações críticas de IA podem exigir aprovação humana").
 *
 * Regra: SOMENTE tools 'critical' passam pelo portão de aprovação, e
 * SOMENTE quando o agente exige aprovação (`requiresApproval = true`).
 * Tools 'read'/'write' nunca ficam retidas aqui — mas toda tool
 * 'write'/'critical' ainda revalida permissão dentro do próprio
 * `execute()` (ver `tool-registry.ts`), independentemente deste resultado.
 */
export function decideToolCallOutcome(criticality: ToolCriticality, requiresApproval: boolean): ToolCallOutcome {
  if (criticality === "critical" && requiresApproval) {
    return "awaiting_approval";
  }
  return "execute";
}

// ---------------------------------------------------------------------
// Busca textual simples em knowledge_sources (CLAUDE.md §25 "a solução
// mais simples que preserve extensibilidade") — SEM embeddings/busca
// vetorial/semântica nesta primeira versão (ver comentário em
// `supabase/migrations/20260818095000_knowledge_sources.sql`).
// ---------------------------------------------------------------------

export interface KnowledgeSourceForSearch {
  id: string;
  name: string;
  content: string | null;
}

export interface KnowledgeMatch {
  id: string;
  name: string;
  excerpt: string;
  score: number;
}

const MAX_EXCERPT_LENGTH = 500;

/**
 * Pontua cada fonte de conhecimento por quantos termos da consulta aparecem
 * em seu conteúdo (contagem simples de substring, case-insensitive) e
 * retorna as `limit` mais relevantes com score > 0. Fontes sem `content`
 * (ex.: `document`/`url` sem snapshot de texto ainda carregado) são
 * ignoradas — não há extração de arquivo aqui, só correspondência de
 * texto já persistido.
 */
export function selectRelevantKnowledge(
  sources: readonly KnowledgeSourceForSearch[],
  query: string,
  limit = 3,
): KnowledgeMatch[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (terms.length === 0) {
    return [];
  }

  const scored = sources
    .filter((source): source is KnowledgeSourceForSearch & { content: string } => Boolean(source.content?.trim()))
    .map((source) => {
      const lowerContent = source.content.toLowerCase();
      const score = terms.reduce((acc, term) => acc + (lowerContent.includes(term) ? 1 : 0), 0);
      return { source, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ source, score }) => ({
    id: source.id,
    name: source.name,
    score,
    excerpt: source.content.slice(0, MAX_EXCERPT_LENGTH),
  }));
}

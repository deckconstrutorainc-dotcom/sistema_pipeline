/**
 * Camada de IA desacoplada (CLAUDE.md §17: "IA deve ser uma camada
 * desacoplada" / "Provider substituível") — mesmo padrão de adapter já
 * usado por `EmailProvider` (M5), `NotificationProvider` (M3) e
 * `IntegrationProvider` (M7, `src/lib/integrations/types.ts`).
 *
 * O domínio (`ai-run-processor.ts`, tools do `tool-registry.ts`) só conhece
 * estas interfaces — nunca detalhes de um provider concreto (Anthropic ou
 * outro). Trocar de provider significa implementar `AIProvider` e trocar a
 * instância usada por `getAIProvider()`; nenhuma lógica de domínio muda.
 */
import type { z } from "zod";

import type { ToolCriticality } from "@/lib/ai/tool-catalog";

// ---------------------------------------------------------------------
// Geração (chamada ao modelo)
// ---------------------------------------------------------------------

/** Especificação de uma tool enviada ao provider — schema em JSON Schema
 * (não Zod: é o formato que a API de LLM realmente consome). */
export interface AIToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIGenerateParams {
  systemPrompt: string;
  messages: AIMessage[];
  tools: AIToolSpec[];
  /** Modelo a usar; cada provider define seu próprio default quando omitido. */
  model?: string;
}

/** Uma chamada de tool solicitada pelo modelo — id opaco do provider,
 * nome da tool e parâmetros já desserializados (não string JSON crua). */
export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIGenerateResult {
  /** Texto livre gerado pelo modelo (resumo, resposta ao usuário etc.). */
  content: string;
  toolCalls: ToolCallRequest[];
  /** Nome do modelo efetivamente usado, conforme retornado pelo provider — gravado em `ai_runs.model`. */
  model: string;
  usage: AIUsage;
  /** Custo estimado em USD desta chamada, calculado pelo PROVIDER (que é
   * quem conhece sua própria tabela de preços) — `null` quando o provider
   * não tem uma tabela de preços conhecida para o modelo usado. Gravado em
   * `ai_runs.cost_usd`. */
  costUsd: number | null;
}

export interface AIProvider {
  readonly providerKey: string;
  generate(params: AIGenerateParams): Promise<AIGenerateResult>;
}

// ---------------------------------------------------------------------
// Tools (ferramentas controladas pelo servidor — CLAUDE.md §17/§27/§28)
// ---------------------------------------------------------------------

/** Contexto de execução de uma tool: sempre resolvido pelo
 * `ai-run-processor.ts` a partir da `ai_run`/`ai_agent`, nunca aceito
 * diretamente do modelo (o modelo só controla `input`, nunca `context`). */
export interface ToolExecutionContext {
  organizationId: string;
  /** Usuário humano responsável pela ação, para fins de auditoria e
   * revalidação de permissão dentro da própria tool (defesa em
   * profundidade) — `requestedBy` do run manual, ou `created_by` do agente
   * quando a run não tem um usuário humano diretamente associado. */
  actorUserId: string | null;
  cardId: string | null;
  aiRunId: string;
}

/** Evidência de extração retornada por uma tool (ex.:
 * `extract_card_fields_from_document`) — o `ai-run-processor.ts` grava cada
 * item em `ai_run_evidences` após a execução bem-sucedida da tool. */
export interface ToolEvidenceInput {
  cardFieldId?: string | null;
  sourceExcerpt: string;
  confidence?: number | null;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  evidences?: ToolEvidenceInput[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  criticality: ToolCriticality;
  /** Schema Zod usado para validar `input` em tempo de execução — nunca
   * confia no JSON que o modelo devolveu sem validar antes de tocar no
   * banco (mesmo princípio de toda validação Zod já usada nos server
   * actions). */
  parametersSchema: z.ZodTypeAny;
  /** JSON Schema equivalente, enviado ao provider como especificação da
   * tool (`AIToolSpec.inputSchema`). Mantido manualmente em sincronia com
   * `parametersSchema` — ver comentário em `tool-registry.ts`. */
  parametersJsonSchema: Record<string, unknown>;
  execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  approveAiRunSchema,
  triggerAiRunSchema,
  type ApproveAiRunInput,
  type TriggerAiRunInput,
} from "@/lib/validation/ai";
import type { ToolCallLogEntry } from "@/server/services/ai-run-processor";

export interface ActionResult {
  success: boolean;
  error?: string;
  runId?: string;
}

export interface AiRunSummary {
  id: string;
  aiAgentId: string;
  aiAgentName: string;
  organizationId: string;
  triggerType: string;
  cardId: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: string;
  model: string | null;
  tokensUsed: number | null;
  costUsd: number | null;
  toolCalls: ToolCallLogEntry[];
  errorMessage: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface AiAgentAccessRow {
  id: string;
  organization_id: string;
  is_active: boolean;
  pipe_id: string | null;
}

/**
 * Dispara uma execução manual de IA (CLAUDE.md §22 M8 "AI Agent simples
 * assistente de card"): valida a permissão do usuário sobre o
 * agente/card/pipe ANTES de sequer criar a run (mesma disciplina de
 * `generateDocument`, M6 — confirma acesso via client autenticado normal,
 * RLS decide, nunca confia apenas em "está autenticado").
 *
 * A linha em `ai_runs` é inserida via client ADMIN porque a tabela não tem
 * policy de INSERT para `authenticated` (CLAUDE.md §17 "toda ação crítica
 * executada por IA deve ser controlada pelo servidor" — nem o próprio
 * disparo manual pode ser um INSERT livre do client; passa por esta action,
 * que já validou tudo antes). O trigger `enqueue_ai_run_job_trigger`
 * enfileira o processamento assíncrono automaticamente.
 */
export async function triggerAiRun(input: TriggerAiRunInput): Promise<ActionResult> {
  const parsed = triggerAiRunSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const { data: agent, error: agentError } = await supabase
    .from("ai_agents")
    .select("id, organization_id, is_active, pipe_id")
    .eq("id", parsed.data.agentId)
    .maybeSingle<AiAgentAccessRow>();

  if (agentError || !agent) {
    return { success: false, error: "Agente não encontrado ou sem permissão de acesso." };
  }

  if (!agent.is_active) {
    return { success: false, error: "Este agente está inativo." };
  }

  let cardPipeId: string | null = null;
  if (parsed.data.cardId) {
    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, pipe_id")
      .eq("id", parsed.data.cardId)
      .maybeSingle<{ id: string; pipe_id: string }>();

    if (cardError || !card) {
      return { success: false, error: "Card não encontrado ou sem permissão de acesso." };
    }

    if (agent.pipe_id && agent.pipe_id !== card.pipe_id) {
      return { success: false, error: "Este agente está restrito a outro pipe." };
    }

    cardPipeId = card.pipe_id;
  }

  const admin = createAdminClient();
  const { data: run, error: insertError } = await admin
    .from("ai_runs")
    .insert({
      ai_agent_id: agent.id,
      organization_id: agent.organization_id,
      trigger_type: "manual",
      card_id: parsed.data.cardId ?? null,
      input: { instruction: parsed.data.instruction },
      status: "pending",
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !run) {
    return { success: false, error: "Não foi possível iniciar a execução de IA." };
  }

  const runId = (run as { id: string }).id;

  if (parsed.data.cardId && cardPipeId) {
    revalidatePath(`/pipes/${cardPipeId}/cards/${parsed.data.cardId}`);
  }
  revalidatePath("/ai-runs");

  return { success: true, runId };
}

/**
 * Aprova/rejeita uma run em `awaiting_approval` (CLAUDE.md §17/§3.29,
 * human-in-the-loop). Delega inteiramente para a RPC `approve_ai_run`
 * (SECURITY DEFINER) — nunca um UPDATE direto em `ai_runs` (que não tem
 * policy de UPDATE para o client). A RPC já valida autorização
 * (admin/super_admin da organização) e o estado atual da run.
 */
export async function approveAiRun(input: ApproveAiRunInput): Promise<ActionResult> {
  const parsed = approveAiRunSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.rpc("approve_ai_run", {
    p_run_id: parsed.data.runId,
    p_approve: parsed.data.approve,
  });

  if (error) {
    return { success: false, error: error.message || "Não foi possível processar a aprovação." };
  }

  revalidatePath("/ai-runs");
  return { success: true, runId: parsed.data.runId };
}

/** Lista as execuções de IA da organização (histórico/auditoria, CLAUDE.md
 * §18) — RLS (`ai_runs_select`) já restringe a membros ativos. */
export async function listAiRuns(organizationId: string): Promise<AiRunSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_runs")
    .select(
      "id, ai_agent_id, organization_id, trigger_type, card_id, input, output, status, model, tokens_used, " +
        "cost_usd, tool_calls, error_message, requested_by, approved_by, approved_at, started_at, finished_at, " +
        "created_at, ai_agents(name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      ai_agent_id: string;
      organization_id: string;
      trigger_type: string;
      card_id: string | null;
      input: Record<string, unknown> | null;
      output: Record<string, unknown> | null;
      status: string;
      model: string | null;
      tokens_used: number | null;
      cost_usd: number | null;
      tool_calls: ToolCallLogEntry[] | null;
      error_message: string | null;
      requested_by: string | null;
      approved_by: string | null;
      approved_at: string | null;
      started_at: string | null;
      finished_at: string | null;
      created_at: string;
      ai_agents: { name: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    aiAgentId: row.ai_agent_id,
    aiAgentName: row.ai_agents?.name ?? "Agente removido",
    organizationId: row.organization_id,
    triggerType: row.trigger_type,
    cardId: row.card_id,
    input: row.input ?? {},
    output: row.output,
    status: row.status,
    model: row.model,
    tokensUsed: row.tokens_used,
    costUsd: row.cost_usd,
    toolCalls: row.tool_calls ?? [],
    errorMessage: row.error_message,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }));
}

/** Execuções de IA associadas a um card específico — usada pela seção de
 * "assistente de IA" na página do card. */
export async function listAiRunsForCard(cardId: string): Promise<AiRunSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_runs")
    .select(
      "id, ai_agent_id, organization_id, trigger_type, card_id, input, output, status, model, tokens_used, " +
        "cost_usd, tool_calls, error_message, requested_by, approved_by, approved_at, started_at, finished_at, " +
        "created_at, ai_agents(name)",
    )
    .eq("card_id", cardId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      ai_agent_id: string;
      organization_id: string;
      trigger_type: string;
      card_id: string | null;
      input: Record<string, unknown> | null;
      output: Record<string, unknown> | null;
      status: string;
      model: string | null;
      tokens_used: number | null;
      cost_usd: number | null;
      tool_calls: ToolCallLogEntry[] | null;
      error_message: string | null;
      requested_by: string | null;
      approved_by: string | null;
      approved_at: string | null;
      started_at: string | null;
      finished_at: string | null;
      created_at: string;
      ai_agents: { name: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    aiAgentId: row.ai_agent_id,
    aiAgentName: row.ai_agents?.name ?? "Agente removido",
    organizationId: row.organization_id,
    triggerType: row.trigger_type,
    cardId: row.card_id,
    input: row.input ?? {},
    output: row.output,
    status: row.status,
    model: row.model,
    tokensUsed: row.tokens_used,
    costUsd: row.cost_usd,
    toolCalls: row.tool_calls ?? [],
    errorMessage: row.error_message,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }));
}

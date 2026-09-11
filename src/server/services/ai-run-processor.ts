import { getAIProvider } from "@/lib/ai/provider-factory";
import { getToolDefinition, resolveAllowedTool } from "@/lib/ai/tool-registry";
import type { AIToolSpec, ToolCallRequest, ToolDefinition, ToolEvidenceInput, ToolExecutionContext } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideToolCallOutcome, selectRelevantKnowledge, type KnowledgeSourceForSearch } from "@/server/services/ai-run-engine";

/**
 * Processamento server-side de uma `ai_run` (CLAUDE.md §17): orquestra
 * carregar o agente, montar o prompt (instruções + contexto do card +
 * conhecimento relevante), chamar o `AIProvider`, e — para cada tool_call
 * retornado pelo modelo — validar a allowlist, decidir se executa
 * imediatamente ou retém para aprovação humana, executar via
 * `tool-registry.ts`, e registrar tudo em `ai_runs.tool_calls`/
 * `ai_run_evidences`.
 *
 * Roda EXCLUSIVAMENTE com o client admin (`SUPABASE_SERVICE_ROLE_KEY`,
 * server-only), chamado apenas por `POST /api/ai/process` (protegido por
 * `CRON_SECRET`, mesmo padrão de `automation-processor.ts` — ver o
 * comentário no topo daquele arquivo para o racional completo de "sem
 * sessão de usuário neste contexto"). Nunca é exposto como server action
 * chamável diretamente pelo client autenticado.
 *
 * ALLOWLIST — REGRA INEGOCIÁVEL (CLAUDE.md §17/§27/§28): um tool_call cujo
 * nome não está em `ai_agent.allowed_tools` é SEMPRE rejeitado e registrado
 * como `status: 'rejected_not_allowed'` em `tool_calls` — nunca executado,
 * mesmo que a tool exista no registro (`tool-registry.ts`). Nenhum caminho
 * de código pula essa checagem, nem na primeira execução nem na retomada
 * após aprovação (`resumeApprovedRun` revalida de novo, caso a configuração
 * do agente tenha mudado entre o pedido e a aprovação).
 *
 * HUMAN-IN-THE-LOOP (CLAUDE.md §17/§3.29): um tool_call de criticidade
 * 'critical' quando `ai_agent.requires_approval = true`
 * (`decideToolCallOutcome`, `ai-run-engine.ts`) NUNCA é executado nesta
 * rodada — a run é marcada `awaiting_approval` e só é retomada por
 * `resumeApprovedRun` depois que `approve_ai_run` (RPC) muda o status para
 * `approved`.
 *
 * Idempotência (CLAUDE.md §11 aplicado a IA): reprocessar uma run já
 * `succeeded`/`failed`/`rejected`/`awaiting_approval` é um no-op — nunca
 * reexecuta tools nem chama o provider de novo. Diferente de
 * `automation_runs`/`webhook_deliveries`, uma `ai_run` que falha NÃO tem
 * retry automático (decisão deliberada — ver comentário em
 * `20260818095100_ai_runs.sql`): chamadas de IA têm custo monetário real,
 * então uma falha fica visível para um humano decidir se dispara uma NOVA
 * execução.
 *
 * LIMITAÇÃO DE ESCOPO DOCUMENTADA: um único lote de tool_calls só processa
 * até a primeira tool 'critical' pendente de aprovação — tool_calls
 * seguintes no mesmo lote também ficam marcados `awaiting_approval` sem
 * serem avaliados individualmente (evita executar escritas depois de um
 * portão de aprovação ainda aberto). Também só é suportado UM tool_call
 * pendente de aprovação por run — suficiente para os casos de uso mínimos
 * deste milestone (M8 "não precisa ser exaustivo").
 */

interface AiAgentRow {
  id: string;
  organization_id: string;
  name: string;
  instructions: string;
  allowed_tools: string[];
  pipe_id: string | null;
  requires_approval: boolean;
  is_active: boolean;
  created_by: string;
}

interface AiRunRow {
  id: string;
  ai_agent_id: string;
  organization_id: string;
  trigger_type: string;
  card_id: string | null;
  input: Record<string, unknown> | null;
  status: string;
  requested_by: string | null;
  tool_calls: ToolCallLogEntry[] | null;
  ai_agents: AiAgentRow | null;
}

export interface ToolCallLogEntry {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "executed" | "failed" | "rejected_not_allowed" | "awaiting_approval";
  output?: unknown;
  error?: string;
}

export interface ProcessAiRunResult {
  runId: string;
  status: string;
  error?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

const TERMINAL_OR_WAITING_STATUSES = new Set(["succeeded", "failed", "rejected", "awaiting_approval"]);

async function failRun(admin: AdminClient, runId: string, message: string): Promise<void> {
  await admin
    .from("ai_runs")
    .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

async function insertEvidences(admin: AdminClient, aiRunId: string, evidences: ToolEvidenceInput[]): Promise<void> {
  if (evidences.length === 0) return;
  await admin.from("ai_run_evidences").insert(
    evidences.map((evidence) => ({
      ai_run_id: aiRunId,
      card_field_id: evidence.cardFieldId ?? null,
      source_excerpt: evidence.sourceExcerpt,
      confidence: evidence.confidence ?? null,
    })),
  );
}

interface ToolCallBatchResult {
  logEntries: ToolCallLogEntry[];
  pendingApproval: boolean;
  anyFailed: boolean;
  collectedEvidences: ToolEvidenceInput[];
}

/** Processa um lote de tool_calls retornado pelo provider — SEMPRE via
 * `resolveAllowedTool` (nunca `getToolDefinition` direto). Ver comentário
 * no topo do arquivo para a regra de allowlist/aprovação. */
async function processToolCallsBatch(
  run: AiRunRow,
  agent: AiAgentRow,
  actorUserId: string | null,
  toolCalls: ToolCallRequest[],
): Promise<ToolCallBatchResult> {
  const logEntries: ToolCallLogEntry[] = [];
  const collectedEvidences: ToolEvidenceInput[] = [];
  let pendingApproval = false;
  let anyFailed = false;

  for (const call of toolCalls) {
    if (pendingApproval) {
      logEntries.push({ id: call.id, name: call.name, input: call.input, status: "awaiting_approval" });
      continue;
    }

    const tool = resolveAllowedTool(call.name, agent.allowed_tools);
    if (!tool) {
      logEntries.push({
        id: call.id,
        name: call.name,
        input: call.input,
        status: "rejected_not_allowed",
        error: `Tool '${call.name}' não está na allowlist deste agente — chamada rejeitada sem execução.`,
      });
      continue;
    }

    const paramsValidation = tool.parametersSchema.safeParse(call.input);
    if (!paramsValidation.success) {
      logEntries.push({
        id: call.id,
        name: call.name,
        input: call.input,
        status: "failed",
        error: "Parâmetros inválidos retornados pelo modelo para esta tool.",
      });
      anyFailed = true;
      continue;
    }

    const outcome = decideToolCallOutcome(tool.criticality, agent.requires_approval);
    if (outcome === "awaiting_approval") {
      logEntries.push({ id: call.id, name: call.name, input: call.input, status: "awaiting_approval" });
      pendingApproval = true;
      continue;
    }

    const context: ToolExecutionContext = {
      organizationId: run.organization_id,
      actorUserId,
      cardId: run.card_id,
      aiRunId: run.id,
    };

    const result = await tool.execute(paramsValidation.data as Record<string, unknown>, context);
    logEntries.push({
      id: call.id,
      name: call.name,
      input: call.input,
      status: result.success ? "executed" : "failed",
      output: result.data,
      error: result.error,
    });
    if (!result.success) {
      anyFailed = true;
    }
    if (result.evidences) {
      collectedEvidences.push(...result.evidences);
    }
  }

  return { logEntries, pendingApproval, anyFailed, collectedEvidences };
}

function buildAllowedToolSpecs(agent: AiAgentRow): AIToolSpec[] {
  return agent.allowed_tools
    .map((name) => getToolDefinition(name))
    .filter((tool): tool is ToolDefinition => Boolean(tool))
    .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.parametersJsonSchema }));
}

async function runFreshAiRun(
  admin: AdminClient,
  run: AiRunRow,
  agent: AiAgentRow,
  actorUserId: string | null,
): Promise<ProcessAiRunResult> {
  await admin.from("ai_runs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", run.id);

  let cardContext: Record<string, unknown> | null = null;
  if (run.card_id) {
    const { data: card } = await admin
      .from("cards")
      .select("id, number, title, due_date, is_done")
      .eq("id", run.card_id)
      .maybeSingle();
    cardContext = (card as Record<string, unknown> | null) ?? null;
  }

  const instructionText = typeof run.input?.["instruction"] === "string" ? (run.input["instruction"] as string) : "";

  const { data: knowledgeRows } = await admin
    .from("knowledge_sources")
    .select("id, name, content")
    .eq("organization_id", run.organization_id)
    .or(`ai_agent_id.eq.${agent.id},ai_agent_id.is.null`);

  const relevantKnowledge = selectRelevantKnowledge(
    (knowledgeRows ?? []) as KnowledgeSourceForSearch[],
    instructionText,
    3,
  );

  const knowledgeBlock =
    relevantKnowledge.length > 0
      ? `\n\nBase de conhecimento relevante (busca textual simples, ver documentação):\n${relevantKnowledge
          .map((k) => `- ${k.name}: ${k.excerpt}`)
          .join("\n")}`
      : "";

  const systemPrompt = `${agent.instructions}${knowledgeBlock}`;

  const tools = buildAllowedToolSpecs(agent);

  const userMessageParts = [instructionText || "Execute a tarefa configurada para este agente."];
  if (cardContext) {
    userMessageParts.push(`Contexto do card: ${JSON.stringify(cardContext)}`);
  }

  const provider = getAIProvider();
  let generation;
  try {
    generation = await provider.generate({
      systemPrompt,
      messages: [{ role: "user", content: userMessageParts.join("\n\n") }],
      tools,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao chamar o provider de IA.";
    await failRun(admin, run.id, message);
    return { runId: run.id, status: "failed", error: message };
  }

  const batch = await processToolCallsBatch(run, agent, actorUserId, generation.toolCalls);
  const tokensUsed = generation.usage.inputTokens + generation.usage.outputTokens;

  if (batch.pendingApproval) {
    await admin
      .from("ai_runs")
      .update({
        status: "awaiting_approval",
        output: generation.content ? { content: generation.content } : null,
        model: generation.model,
        tokens_used: tokensUsed,
        cost_usd: generation.costUsd,
        tool_calls: batch.logEntries,
      })
      .eq("id", run.id);
    return { runId: run.id, status: "awaiting_approval" };
  }

  await insertEvidences(admin, run.id, batch.collectedEvidences);

  const finalStatus = batch.anyFailed ? "failed" : "succeeded";
  await admin
    .from("ai_runs")
    .update({
      status: finalStatus,
      output: generation.content ? { content: generation.content } : null,
      model: generation.model,
      tokens_used: tokensUsed,
      cost_usd: generation.costUsd,
      tool_calls: batch.logEntries,
      error_message: batch.anyFailed ? "Uma ou mais tools falharam durante a execução — ver tool_calls." : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return { runId: run.id, status: finalStatus };
}

/**
 * Retoma uma run em 'approved': executa o ÚNICO tool_call pendente
 * (`status: 'awaiting_approval'`) registrado em `tool_calls`. Revalida a
 * allowlist do agente de novo — se a configuração mudou entre o pedido e a
 * aprovação (agente editado, tool removida do `allowed_tools`), a execução
 * é recusada mesmo já aprovada por um humano.
 */
async function resumeApprovedRun(
  admin: AdminClient,
  run: AiRunRow,
  agent: AiAgentRow,
  actorUserId: string | null,
): Promise<ProcessAiRunResult> {
  await admin.from("ai_runs").update({ status: "running" }).eq("id", run.id);

  const toolCalls = [...(run.tool_calls ?? [])];
  const pendingIndex = toolCalls.findIndex((entry) => entry.status === "awaiting_approval");

  if (pendingIndex === -1) {
    const message = "Run aprovada, mas nenhum tool_call pendente foi encontrado para executar.";
    await failRun(admin, run.id, message);
    return { runId: run.id, status: "failed", error: message };
  }

  const pending = toolCalls[pendingIndex]!;
  const tool = resolveAllowedTool(pending.name, agent.allowed_tools);

  if (!tool) {
    toolCalls[pendingIndex] = {
      ...pending,
      status: "rejected_not_allowed",
      error: "Tool não está mais na allowlist deste agente no momento da aprovação.",
    };
    await admin
      .from("ai_runs")
      .update({
        status: "failed",
        tool_calls: toolCalls,
        error_message: "Tool aprovada não está mais na allowlist do agente.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { runId: run.id, status: "failed" };
  }

  const paramsValidation = tool.parametersSchema.safeParse(pending.input);
  if (!paramsValidation.success) {
    toolCalls[pendingIndex] = { ...pending, status: "failed", error: "Parâmetros inválidos no tool_call aprovado." };
    await admin
      .from("ai_runs")
      .update({
        status: "failed",
        tool_calls: toolCalls,
        error_message: "Parâmetros inválidos no tool_call aprovado.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { runId: run.id, status: "failed" };
  }

  const context: ToolExecutionContext = {
    organizationId: run.organization_id,
    actorUserId,
    cardId: run.card_id,
    aiRunId: run.id,
  };

  const result = await tool.execute(paramsValidation.data as Record<string, unknown>, context);

  toolCalls[pendingIndex] = {
    ...pending,
    status: result.success ? "executed" : "failed",
    output: result.data,
    error: result.error,
  };

  if (result.success && result.evidences) {
    await insertEvidences(admin, run.id, result.evidences);
  }

  const finalStatus = result.success ? "succeeded" : "failed";
  await admin
    .from("ai_runs")
    .update({
      status: finalStatus,
      tool_calls: toolCalls,
      error_message: result.success ? null : (result.error ?? "Falha ao executar a tool aprovada."),
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return { runId: run.id, status: finalStatus };
}

export async function processAiRun(runId: string): Promise<ProcessAiRunResult> {
  const admin = createAdminClient();

  const { data: run, error: runError } = await admin
    .from("ai_runs")
    .select(
      "id, ai_agent_id, organization_id, trigger_type, card_id, input, status, requested_by, tool_calls, " +
        "ai_agents(id, organization_id, name, instructions, allowed_tools, pipe_id, requires_approval, is_active, created_by)",
    )
    .eq("id", runId)
    .maybeSingle<AiRunRow>();

  if (runError || !run) {
    return { runId, status: "failed", error: "ai_run não encontrada." };
  }

  // Idempotência: reprocessar uma run já finalizada, rejeitada ou aguardando
  // aprovação humana nunca reexecuta nada.
  if (TERMINAL_OR_WAITING_STATUSES.has(run.status)) {
    return { runId, status: run.status };
  }

  const agent = run.ai_agents;
  if (!agent) {
    const message = "Agente de IA não encontrado.";
    await failRun(admin, runId, message);
    return { runId, status: "failed", error: message };
  }

  if (!agent.is_active) {
    const message = "Agente de IA está inativo.";
    await failRun(admin, runId, message);
    return { runId, status: "failed", error: message };
  }

  const actorUserId = run.requested_by ?? agent.created_by;

  if (run.status === "approved") {
    return resumeApprovedRun(admin, run, agent, actorUserId);
  }

  // 'pending' ou 'running' (reprocessamento após queda no meio da execução
  // — seguro reiniciar do zero: tools são idempotentes via upsert/23505).
  return runFreshAiRun(admin, run, agent, actorUserId);
}

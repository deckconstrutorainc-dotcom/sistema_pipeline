import { GeminiProvider } from "@/lib/ai/providers/gemini-provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listOrganizationMembersForAssignment } from "@/server/queries/organizations";
import {
  buildExtractionPrompt,
  buildValidatedFieldValues,
  matchAssigneeId,
  normalizeDueDate,
  parseExtractionJson,
  type VoiceCardFieldSpec,
} from "@/server/services/voice-card-extraction-engine";

/**
 * Orquestração I/O da feature "Voz -> Card" (M8): busca os campos do pipe e
 * os membros da organização, monta o prompt, chama o `GeminiProvider` com o
 * áudio, valida/normaliza a resposta (`voice-card-extraction-engine.ts`) e
 * registra uma linha em `ai_runs` para auditoria (CLAUDE.md §17/§18).
 *
 * IMPORTANTE (decisão de arquitetura, ver CLAUDE.md §3.27-3.29 / relatório
 * da tarefa): esta função NUNCA cria um card. Ela só retorna dados
 * pré-preenchidos para o formulário de criação de card já existente
 * (`CreateCardForm`) — o humano revisa e confirma manualmente clicando em
 * "Adicionar card". Isso é o mesmo princípio de "aprovação humana para
 * ações críticas" já usado no motor de automação de IA (`ai-run-processor.ts`,
 * `requires_approval`), aplicado aqui de forma ainda mais conservadora: nem
 * chega a existir um "tool_call" a aprovar, o card simplesmente não é criado
 * sem uma ação humana explícita.
 *
 * Não usa o motor de `ai_agents`/tool-registry existente (que é para agentes
 * configuráveis que operam sobre cards já existentes) — em vez disso, usa
 * (e cria sob demanda, se necessário) um `ai_agent` "de sistema" por
 * organização só para ter uma FK válida em `ai_runs.ai_agent_id` (NOT NULL)
 * e assim reaproveitar a MESMA tabela/RLS/observabilidade de auditoria de
 * IA já existente, em vez de criar uma tabela de log paralela — CLAUDE.md
 * §3.19/§18 "reaproveite" / "não duplique".
 */

const SYSTEM_AGENT_NAME = "Voz -> Card (sistema)";
// Ver o comentário sobre escolha de modelo em `gemini-provider.ts`
// (DEFAULT_MODEL) — passado explicitamente aqui só para deixar visível qual
// modelo esta feature específica usa, sem depender do default do provider
// mudar silenciosamente no futuro para outro uso do GeminiProvider.
const GEMINI_AUDIO_MODEL = "gemini-3.6-flash";

export interface VoiceExtractionData {
  title: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  /** Nome exatamente como transcrito pela IA — exibido na UI mesmo quando
   * não foi possível casar com nenhum membro, para o humano decidir. */
  assigneeName: string | null;
  /** `fieldId -> valor`, já validado contra o tipo real do campo. */
  fieldValues: Record<string, unknown>;
}

export interface VoiceExtractionResult {
  success: boolean;
  error?: string;
  data?: VoiceExtractionData;
}

export interface ExtractCardDataFromAudioParams {
  pipeId: string;
  organizationId: string;
  audioBase64: string;
  mimeType: string;
  /** Usuário humano que disparou a gravação — gravado em `ai_runs.requested_by`
   * para auditoria (CLAUDE.md §18 "usuário ou origem"). */
  actorUserId: string;
}

interface FieldOptionRow {
  value: string;
  label: string;
}
interface FieldRow {
  id: string;
  label: string;
  field_key: string;
  type: string;
  field_options: FieldOptionRow[] | null;
}

/**
 * Localiza (ou cria, na primeira vez) o `ai_agent` "de sistema" usado só
 * para gravar `ai_runs` desta feature. Usa o client ADMIN porque a policy
 * `ai_agents_insert` exige papel admin/super_admin — um membro comum
 * qualquer pode disparar a extração por voz, então a criação deste agente
 * de suporte não pode depender do papel de quem está usando a feature.
 *
 * PENDÊNCIA DOCUMENTADA: pequena janela de corrida entre o SELECT e o
 * INSERT pode, em tese, criar duas linhas duplicadas se dois usuários da
 * mesma organização usarem a feature pela primeira vez ao mesmo tempo —
 * inofensivo (nenhuma constraint de unicidade é violada, e o efeito é só um
 * agente "órfão" extra no catálogo), mas documentado em vez de ignorado.
 */
async function getOrCreateSystemAgentId(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  actorUserId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("ai_agents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", SYSTEM_AGENT_NAME)
    .maybeSingle<{ id: string }>();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("ai_agents")
    .insert({
      organization_id: organizationId,
      name: SYSTEM_AGENT_NAME,
      description:
        "Agente de sistema usado apenas para registrar em ai_runs as execuções da feature Voz -> Card (transcrição de áudio -> pré-preenchimento do formulário de novo card). Não executa tools nem aparece como agente configurável para uso manual.",
      instructions: "",
      allowed_tools: [],
      requires_approval: false,
      is_active: true,
      created_by: actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) {
    throw new Error("Não foi possível preparar o agente de sistema para registrar a execução de IA.");
  }

  return created.id;
}

async function loadPipeFields(pipeId: string): Promise<VoiceCardFieldSpec[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fields")
    .select("id, label, field_key, type, field_options(value, label)")
    .eq("pipe_id", pipeId)
    .eq("is_archived", false);

  const rows = (data ?? []) as unknown as FieldRow[];
  // `user`/`attachment` não são preenchíveis na criação do card (mesma
  // simplificação já documentada em `CreateCardForm`) — não faz sentido
  // pedir para a IA extrair um valor para eles.
  return rows
    .filter((row) => row.type !== "user" && row.type !== "attachment")
    .map((row) => ({
      id: row.id,
      fieldKey: row.field_key,
      label: row.label,
      type: row.type as VoiceCardFieldSpec["type"],
      options: (row.field_options ?? []).map((option) => ({ value: option.value, label: option.label })),
    }));
}

export async function extractCardDataFromAudio(
  params: ExtractCardDataFromAudioParams,
): Promise<VoiceExtractionResult> {
  const admin = createAdminClient();

  let agentId: string;
  try {
    agentId = await getOrCreateSystemAgentId(admin, params.organizationId, params.actorUserId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao preparar a execução de IA.";
    return { success: false, error: message };
  }

  const runInput = { pipe_id: params.pipeId, mime_type: params.mimeType };

  async function recordRun(status: "succeeded" | "failed", output: unknown, opts: {
    model?: string | null;
    tokensUsed?: number | null;
    errorMessage?: string | null;
  } = {}): Promise<void> {
    await admin.from("ai_runs").insert({
      ai_agent_id: agentId,
      organization_id: params.organizationId,
      trigger_type: "manual",
      card_id: null,
      input: runInput,
      output: output ?? null,
      status,
      model: opts.model ?? null,
      tokens_used: opts.tokensUsed ?? null,
      cost_usd: null,
      requested_by: params.actorUserId,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      error_message: opts.errorMessage ?? null,
    });
  }

  let pipeFields: VoiceCardFieldSpec[];
  try {
    pipeFields = await loadPipeFields(params.pipeId);
  } catch {
    const message = "Não foi possível carregar os campos do pipe para preparar a extração.";
    await recordRun("failed", null, { errorMessage: message });
    return { success: false, error: message };
  }

  const members = await listOrganizationMembersForAssignment(params.organizationId);

  const systemPrompt = buildExtractionPrompt(pipeFields, members);
  const provider = new GeminiProvider();

  let content: string;
  let model: string;
  let tokensUsed: number;
  try {
    const generation = await provider.generate({
      systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Transcreva o áudio anexado (português do Brasil) e responda apenas com o JSON estruturado pedido nas instruções.",
        },
      ],
      tools: [],
      model: GEMINI_AUDIO_MODEL,
      audio: { base64: params.audioBase64, mimeType: params.mimeType },
    });
    content = generation.content;
    model = generation.model;
    tokensUsed = generation.usage.inputTokens + generation.usage.outputTokens;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao chamar a IA de transcrição.";
    await recordRun("failed", null, { errorMessage: message });
    return { success: false, error: `Não foi possível transcrever/analisar o áudio: ${message}` };
  }

  const parsed = parseExtractionJson(content);
  if (!parsed.success) {
    await recordRun("failed", { raw_content: content }, { model, tokensUsed, errorMessage: parsed.error });
    return { success: false, error: parsed.error };
  }

  const assigneeId = matchAssigneeId(parsed.data.assigneeName, members);
  const fieldValues = buildValidatedFieldValues(parsed.data.fields, pipeFields);
  const dueDate = normalizeDueDate(parsed.data.dueDate);

  const data: VoiceExtractionData = {
    title: parsed.data.title?.trim() || null,
    dueDate,
    assigneeId,
    assigneeName: parsed.data.assigneeName ?? null,
    fieldValues,
  };

  await recordRun("succeeded", data as unknown as Record<string, unknown>, { model, tokensUsed });

  return { success: true, data };
}

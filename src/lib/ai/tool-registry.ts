/**
 * Registro central de tools de IA controladas pelo servidor (CLAUDE.md §17/
 * §27/§28: "Ferramentas controladas pelo servidor" / "Toda ação crítica
 * executada por IA deve ser controlada pelo servidor" / "IA nunca deve
 * acessar o banco diretamente sem ferramentas e validações autorizadas").
 *
 * REGRAS OBRIGATÓRIAS deste arquivo (reforçadas em cada tool abaixo):
 *   1. `ai-run-processor.ts` NUNCA chama `getToolDefinition()` diretamente
 *      para obter uma tool a executar — SEMPRE passa pela allowlist via
 *      `resolveAllowedTool(name, agent.allowed_tools)`. Uma tool que o
 *      modelo "pediu" mas que não está na allowlist do agente nunca chega a
 *      ter `execute()` chamado, mesmo que exista no registro.
 *   2. Toda tool 'write'/'critical' REVALIDA permissão dentro do próprio
 *      `execute()` (defesa em profundidade — não confia que o chamador já
 *      autorizou). Como `ai-run-processor.ts` roda sem sessão de usuário
 *      (via `POST /api/ai/process`, protegido por `CRON_SECRET` — mesmo
 *      motivo de `automation-processor.ts` usar o client admin em vez de
 *      server actions comuns, ver o comentário no topo daquele arquivo), a
 *      revalidação aqui usa o client ADMIN consultando diretamente
 *      `organization_memberships`/tabelas de negócio (reimplementação
 *      mínima da mesma regra de `is_org_member`, já que a função SQL
 *      depende de `auth.uid()` de sessão, indisponível neste contexto) —
 *      não uma chamada às server actions de M2/M4 (que exigem `createClient()`
 *      vinculado a cookies de sessão, também indisponível aqui).
 *   3. Toda escrita reaproveita a MESMA validação de negócio já usada pelos
 *      server actions correspondentes (`validateFieldValue` de
 *      `src/lib/validation/fields.ts`, mesma tolerância a `23505` de
 *      `automation-processor.ts` para operações idempotentes) — nunca
 *      inventa uma regra nova.
 *   4. Toda tool grava em `card_activities` com `via: 'ai'`/`'ai_extraction'`
 *      e `ai_run_id`, mesmo padrão de `via: 'automation'` já usado por
 *      `automation-processor.ts` (CLAUDE.md §18 auditoria).
 *
 * LIMITAÇÃO DOCUMENTADA (ver relatório final do M8): a revalidação de
 * permissão aqui confirma que o ator é membro ativo da organização e que o
 * card/database pertence à mesma organização do run (isolamento de
 * tenant) — não reimplementa a política completa de "pipe restrito"
 * (`is_pipe_member`, M2, que considera `pipe_memberships`). Isso é
 * suficiente como defesa em profundidade básica; a autorização "de
 * verdade" já aconteceu em `triggerAiRun` (que roda com sessão real de
 * usuário e usa RLS normalmente).
 */
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { TOOL_CATALOG } from "@/lib/ai/tool-catalog";
import type { ToolDefinition, ToolEvidenceInput, ToolExecutionContext, ToolExecutionResult } from "@/lib/ai/types";
import { validateFieldValue, type FieldType } from "@/lib/validation/fields";

type AdminClient = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------
// Helpers de autorização/auditoria compartilhados por várias tools.
// ---------------------------------------------------------------------

async function actorIsOrgMember(
  admin: AdminClient,
  organizationId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const { data } = await admin
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data);
}

interface CardAccessInfo {
  cardId: string;
  pipeId: string;
}

type CardAccessCheck = { ok: true; card: CardAccessInfo } | { ok: false; error: string };

/** Confirma que o ator é membro ativo da organização E que o card pertence
 * a essa mesma organização (isolamento de tenant) antes de qualquer tool
 * ler/escrever dados de um card. */
async function assertCardAccess(
  admin: AdminClient,
  context: ToolExecutionContext,
  cardId: string,
): Promise<CardAccessCheck> {
  const isMember = await actorIsOrgMember(admin, context.organizationId, context.actorUserId);
  if (!isMember) {
    return { ok: false, error: "Ator sem permissão nesta organização." };
  }

  const { data: card } = await admin
    .from("cards")
    .select("id, pipe_id, pipes(organization_id)")
    .eq("id", cardId)
    .maybeSingle<{ id: string; pipe_id: string; pipes: { organization_id: string } | null }>();

  if (!card || card.pipes?.organization_id !== context.organizationId) {
    return { ok: false, error: "Card não encontrado nesta organização." };
  }

  return { ok: true, card: { cardId: card.id, pipeId: card.pipe_id } };
}

async function logAiActivity(
  admin: AdminClient,
  cardId: string,
  actorId: string | null,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Insert direto via client admin (não via RPC log_card_activity, que
  // exige auth.uid() de sessão) — mesmo padrão de
  // `automation-processor.ts` (`logAutomationActivity`).
  await admin.from("card_activities").insert({ card_id: cardId, actor_id: actorId, type, payload });
}

// ---------------------------------------------------------------------
// 1. summarize_card (read)
// ---------------------------------------------------------------------

const summarizeCardParamsSchema = z.object({ cardId: z.string().uuid() });

async function executeSummarizeCard(
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const parsed = summarizeCardParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Parâmetros inválidos para summarize_card." };
  }

  const admin = createAdminClient();
  const access = await assertCardAccess(admin, context, parsed.data.cardId);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const [{ data: cardRow }, { data: fieldValueRows }, { data: commentRows }, { data: fieldRows }] = await Promise.all([
    admin
      .from("cards")
      .select("id, number, title, due_date, is_done, is_archived")
      .eq("id", access.card.cardId)
      .maybeSingle<{
        id: string;
        number: number;
        title: string;
        due_date: string | null;
        is_done: boolean;
        is_archived: boolean;
      }>(),
    admin.from("card_field_values").select("field_id, value").eq("card_id", access.card.cardId),
    admin
      .from("comments")
      .select("body, created_at")
      .eq("card_id", access.card.cardId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("fields").select("id, label").eq("pipe_id", access.card.pipeId),
  ]);

  const labelById = new Map(((fieldRows ?? []) as { id: string; label: string }[]).map((f) => [f.id, f.label]));
  const fields = ((fieldValueRows ?? []) as { field_id: string; value: unknown }[]).map((v) => ({
    label: labelById.get(v.field_id) ?? v.field_id,
    value: v.value,
  }));

  return {
    success: true,
    data: {
      card: cardRow,
      fields,
      recentComments: ((commentRows ?? []) as { body: string }[]).map((c) => c.body),
    },
  };
}

// ---------------------------------------------------------------------
// 2. search_records (read) — reaproveita o conceito de `searchRecords`
// (M4, `src/server/actions/records.ts`), mas via client admin (sem sessão
// disponível neste contexto — ver comentário no topo do arquivo).
// ---------------------------------------------------------------------

const searchRecordsParamsSchema = z.object({
  databaseId: z.string().uuid(),
  query: z.string().trim().max(200).optional(),
});

async function executeSearchRecords(
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const parsed = searchRecordsParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Parâmetros inválidos para search_records." };
  }

  const admin = createAdminClient();
  const isMember = await actorIsOrgMember(admin, context.organizationId, context.actorUserId);
  if (!isMember) {
    return { success: false, error: "Ator sem permissão nesta organização." };
  }

  const { data: database } = await admin
    .from("databases")
    .select("id, organization_id")
    .eq("id", parsed.data.databaseId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (!database || database.organization_id !== context.organizationId) {
    return { success: false, error: "Database não encontrado nesta organização." };
  }

  let query = admin
    .from("records")
    .select("id, title, updated_at")
    .eq("database_id", parsed.data.databaseId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (parsed.data.query) {
    query = query.ilike("title", `%${parsed.data.query}%`);
  }

  const { data: records } = await query;

  return { success: true, data: { records: records ?? [] } };
}

// ---------------------------------------------------------------------
// 3. update_card_field (write) — mesma validação de `validateFieldValue`
// usada por `updateCardFields` (M2, `src/server/actions/cards.ts`).
// ---------------------------------------------------------------------

const updateCardFieldParamsSchema = z.object({
  cardId: z.string().uuid(),
  fieldId: z.string().uuid(),
  value: z.unknown(),
});

async function executeUpdateCardField(
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const parsed = updateCardFieldParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Parâmetros inválidos para update_card_field." };
  }

  const admin = createAdminClient();
  const access = await assertCardAccess(admin, context, parsed.data.cardId);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const { data: field } = await admin
    .from("fields")
    .select("id, pipe_id, type, is_archived")
    .eq("id", parsed.data.fieldId)
    .maybeSingle<{ id: string; pipe_id: string; type: string; is_archived: boolean }>();

  if (!field || field.pipe_id !== access.card.pipeId || field.is_archived) {
    return { success: false, error: "Campo não encontrado neste card." };
  }

  const validation = validateFieldValue(field.type as FieldType, parsed.data.value);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? "Valor inválido para o campo." };
  }

  const { error } = await admin.from("card_field_values").upsert(
    { card_id: access.card.cardId, field_id: field.id, value: parsed.data.value ?? null, updated_by: context.actorUserId },
    { onConflict: "card_id,field_id" },
  );
  if (error) {
    return { success: false, error: "Não foi possível salvar o campo." };
  }

  await logAiActivity(admin, access.card.cardId, context.actorUserId, "field_updated", {
    field_ids: [field.id],
    via: "ai",
    ai_run_id: context.aiRunId,
  });

  return { success: true, data: { fieldId: field.id } };
}

// ---------------------------------------------------------------------
// 4. suggest_label (write) — classificação simples: aplica uma label JÁ
// EXISTENTE do pipe (o modelo escolhe entre as labels informadas no
// contexto do prompt, nunca cria uma label nova por conta própria).
// ---------------------------------------------------------------------

const suggestLabelParamsSchema = z.object({
  cardId: z.string().uuid(),
  labelId: z.string().uuid(),
});

async function executeSuggestLabel(
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const parsed = suggestLabelParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Parâmetros inválidos para suggest_label." };
  }

  const admin = createAdminClient();
  const access = await assertCardAccess(admin, context, parsed.data.cardId);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const { data: label } = await admin
    .from("labels")
    .select("id, pipe_id")
    .eq("id", parsed.data.labelId)
    .maybeSingle<{ id: string; pipe_id: string }>();

  if (!label || label.pipe_id !== access.card.pipeId) {
    return { success: false, error: "Label não encontrada neste pipe." };
  }

  const { error } = await admin
    .from("card_labels")
    .insert({ card_id: access.card.cardId, label_id: label.id });

  // Tolerante a violação de unicidade (idempotência — mesmo padrão de
  // `automation-processor.ts`: reaplicar a mesma label não é um erro).
  if (error && error.code !== "23505") {
    return { success: false, error: "Não foi possível aplicar a label." };
  }

  if (!error) {
    await logAiActivity(admin, access.card.cardId, context.actorUserId, "label_added", {
      label_id: label.id,
      via: "ai",
      ai_run_id: context.aiRunId,
    });
  }

  return { success: true, data: { labelId: label.id } };
}

// ---------------------------------------------------------------------
// 5. extract_card_fields_from_document (critical) — o modelo já leu o
// texto/documento fornecido no prompt e propõe valores + evidências; esta
// tool só VALIDA e PERSISTE o que o modelo propôs (não faz nenhuma leitura
// de arquivo por conta própria). Criticidade 'critical': pode sobrescrever
// vários campos de uma vez, por isso sujeita a aprovação humana quando
// `ai_agent.requires_approval = true` (decisão de M8, ver
// `ai-run-processor.ts`).
// ---------------------------------------------------------------------

const extractionItemSchema = z.object({
  fieldId: z.string().uuid(),
  value: z.unknown(),
  sourceExcerpt: z.string().trim().min(1, "Informe o trecho-fonte da extração.").max(2000),
  confidence: z.number().min(0).max(1).optional(),
});

const extractCardFieldsParamsSchema = z.object({
  cardId: z.string().uuid(),
  extractions: z.array(extractionItemSchema).min(1).max(20),
});

async function executeExtractCardFields(
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const parsed = extractCardFieldsParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: "Parâmetros inválidos para extract_card_fields_from_document." };
  }

  const admin = createAdminClient();
  const access = await assertCardAccess(admin, context, parsed.data.cardId);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const fieldIds = parsed.data.extractions.map((e) => e.fieldId);
  const { data: fieldRows } = await admin
    .from("fields")
    .select("id, pipe_id, type, is_archived")
    .in("id", fieldIds);

  const fieldsById = new Map(
    ((fieldRows ?? []) as { id: string; pipe_id: string; type: string; is_archived: boolean }[]).map((f) => [
      f.id,
      f,
    ]),
  );

  const evidences: ToolEvidenceInput[] = [];
  const appliedFieldIds: string[] = [];

  for (const extraction of parsed.data.extractions) {
    const field = fieldsById.get(extraction.fieldId);
    if (!field || field.pipe_id !== access.card.pipeId || field.is_archived) {
      // Extração para campo inválido/de outro pipe é ignorada (não falha a
      // tool inteira) — o modelo pode ter proposto campos além dos
      // realmente existentes; só aplicamos o que é válido.
      continue;
    }

    const validation = validateFieldValue(field.type as FieldType, extraction.value);
    if (!validation.valid) {
      continue;
    }

    const { error } = await admin.from("card_field_values").upsert(
      { card_id: access.card.cardId, field_id: field.id, value: extraction.value ?? null, updated_by: context.actorUserId },
      { onConflict: "card_id,field_id" },
    );
    if (error) {
      continue;
    }

    appliedFieldIds.push(field.id);
    evidences.push({
      cardFieldId: field.id,
      sourceExcerpt: extraction.sourceExcerpt,
      confidence: extraction.confidence ?? null,
    });
  }

  if (appliedFieldIds.length === 0) {
    return {
      success: false,
      error: "Nenhum dos campos extraídos pôde ser aplicado (inválidos, arquivados ou de outro pipe).",
    };
  }

  await logAiActivity(admin, access.card.cardId, context.actorUserId, "field_updated", {
    field_ids: appliedFieldIds,
    via: "ai_extraction",
    ai_run_id: context.aiRunId,
  });

  return { success: true, data: { appliedFieldIds }, evidences };
}

// ---------------------------------------------------------------------
// Montagem do registro: combina metadados de `TOOL_CATALOG` (nome,
// descrição, criticidade — compartilhados com a UI, ver
// `src/lib/ai/tool-catalog.ts`) com schema Zod + JSON Schema + `execute()`
// definidos aqui. Falha alto e cedo (no carregamento do módulo) se algum
// nome do catálogo não tiver implementação — nunca poderia haver uma tool
// "fantasma" listada na UI sem execução real por trás.
// ---------------------------------------------------------------------

interface ToolImplementation {
  parametersSchema: ToolDefinition["parametersSchema"];
  parametersJsonSchema: ToolDefinition["parametersJsonSchema"];
  execute: ToolDefinition["execute"];
}

const TOOL_IMPLEMENTATIONS: Record<string, ToolImplementation> = {
  summarize_card: {
    parametersSchema: summarizeCardParamsSchema,
    parametersJsonSchema: {
      type: "object",
      properties: { cardId: { type: "string", description: "UUID do card a resumir." } },
      required: ["cardId"],
      additionalProperties: false,
    },
    execute: executeSummarizeCard,
  },
  search_records: {
    parametersSchema: searchRecordsParamsSchema,
    parametersJsonSchema: {
      type: "object",
      properties: {
        databaseId: { type: "string", description: "UUID do database (M4) a pesquisar." },
        query: { type: "string", description: "Texto de busca no título dos registros (opcional)." },
      },
      required: ["databaseId"],
      additionalProperties: false,
    },
    execute: executeSearchRecords,
  },
  update_card_field: {
    parametersSchema: updateCardFieldParamsSchema,
    parametersJsonSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "UUID do card a atualizar." },
        fieldId: { type: "string", description: "UUID do campo (definição em `fields`) a atualizar." },
        value: { description: "Novo valor do campo, no formato adequado ao tipo do campo." },
      },
      required: ["cardId", "fieldId", "value"],
      additionalProperties: false,
    },
    execute: executeUpdateCardField,
  },
  suggest_label: {
    parametersSchema: suggestLabelParamsSchema,
    parametersJsonSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "UUID do card a rotular." },
        labelId: { type: "string", description: "UUID de uma label JÁ EXISTENTE do pipe do card." },
      },
      required: ["cardId", "labelId"],
      additionalProperties: false,
    },
    execute: executeSuggestLabel,
  },
  extract_card_fields_from_document: {
    parametersSchema: extractCardFieldsParamsSchema,
    parametersJsonSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "UUID do card cujos campos serão preenchidos." },
        extractions: {
          type: "array",
          description: "Lista de valores extraídos do documento/texto fornecido, com evidência.",
          items: {
            type: "object",
            properties: {
              fieldId: { type: "string", description: "UUID do campo do pipe deste card." },
              value: { description: "Valor extraído, no formato adequado ao tipo do campo." },
              sourceExcerpt: { type: "string", description: "Trecho literal da fonte que embasa este valor." },
              confidence: { type: "number", description: "Confiança de 0 a 1 na extração (opcional)." },
            },
            required: ["fieldId", "value", "sourceExcerpt"],
            additionalProperties: false,
          },
        },
      },
      required: ["cardId", "extractions"],
      additionalProperties: false,
    },
    execute: executeExtractCardFields,
  },
};

export const TOOL_REGISTRY: readonly ToolDefinition[] = TOOL_CATALOG.map((entry) => {
  const impl = TOOL_IMPLEMENTATIONS[entry.name];
  if (!impl) {
    throw new Error(`Tool '${entry.name}' está no catálogo (tool-catalog.ts) mas não tem implementação registrada.`);
  }
  return { ...entry, ...impl };
});

const registryByName = new Map(TOOL_REGISTRY.map((tool) => [tool.name, tool]));

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return registryByName.get(name);
}

/**
 * ÚNICO ponto de resolução de tool que `ai-run-processor.ts` deve usar.
 * Retorna `null` (nunca lança) quando a tool não está na allowlist do
 * agente OU não existe no registro — o chamador trata os dois casos da
 * mesma forma: rejeita o tool_call sem executar.
 */
export function resolveAllowedTool(name: string, allowedTools: readonly string[]): ToolDefinition | null {
  if (!allowedTools.includes(name)) {
    return null;
  }
  return getToolDefinition(name) ?? null;
}

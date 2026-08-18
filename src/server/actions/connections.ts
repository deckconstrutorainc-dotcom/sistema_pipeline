"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  autofillFromRecordSchema,
  connectCardToCardSchema,
  connectCardToRecordSchema,
  disconnectCardFromCardSchema,
  disconnectCardFromRecordSchema,
  type AutofillFromRecordInput,
  type ConnectCardToCardInput,
  type ConnectCardToRecordInput,
  type DisconnectCardFromCardInput,
  type DisconnectCardFromRecordInput,
} from "@/lib/validation/databases";
import type { FieldType } from "@/lib/validation/fields";
import { resolveAutofill, type CardFieldTarget, type RecordFieldSnapshot } from "@/server/services/autofill";

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface AutofillActionResult extends ActionResult {
  applied?: { fieldId: string; value: unknown }[];
  skipped?: { fieldId: string; reason: string }[];
}

/** Registra histórico via RPC SECURITY DEFINER `log_card_activity`, mesmo
 * padrão de `src/server/actions/cards.ts` (card_activities não expõe
 * policy de INSERT direto ao client). */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await supabase.rpc("log_card_activity", { p_card_id: cardId, p_type: type, p_payload: payload });
}

export async function connectCardToRecord(input: ConnectCardToRecordInput): Promise<ActionResult> {
  const parsed = connectCardToRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from("card_record_connections").insert({
    card_id: parsed.data.cardId,
    record_id: parsed.data.recordId,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Este card já está conectado a este registro." };
    }
    return {
      success: false,
      error: "Não foi possível conectar o card ao registro (verifique se ambos pertencem à mesma organização).",
    };
  }

  await logActivity(supabase, parsed.data.cardId, "record_connected", { record_id: parsed.data.recordId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function disconnectCardFromRecord(input: DisconnectCardFromRecordInput): Promise<ActionResult> {
  const parsed = disconnectCardFromRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("card_record_connections")
    .delete()
    .eq("card_id", parsed.data.cardId)
    .eq("record_id", parsed.data.recordId);

  if (error) {
    return { success: false, error: "Não foi possível desconectar o registro." };
  }

  await logActivity(supabase, parsed.data.cardId, "record_disconnected", { record_id: parsed.data.recordId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function connectCardToCard(input: ConnectCardToCardInput): Promise<ActionResult> {
  const parsed = connectCardToCardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  // A normalização de ordem (card_id_a < card_id_b) acontece no trigger
  // `normalize_card_card_connection_trigger` — o client não precisa (e não
  // deve) decidir a ordem.
  const { error } = await supabase.from("card_card_connections").insert({
    card_id_a: parsed.data.cardId,
    card_id_b: parsed.data.otherCardId,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Estes cards já estão conectados." };
    }
    return {
      success: false,
      error: "Não foi possível conectar os cards (verifique se ambos pertencem à mesma organização).",
    };
  }

  await logActivity(supabase, parsed.data.cardId, "card_connected", { other_card_id: parsed.data.otherCardId });
  await logActivity(supabase, parsed.data.otherCardId, "card_connected", { other_card_id: parsed.data.cardId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function disconnectCardFromCard(input: DisconnectCardFromCardInput): Promise<ActionResult> {
  const parsed = disconnectCardFromCardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const [a, b] = [parsed.data.cardId, parsed.data.otherCardId].sort();

  const { error } = await supabase
    .from("card_card_connections")
    .delete()
    .eq("card_id_a", a)
    .eq("card_id_b", b);

  if (error) {
    return { success: false, error: "Não foi possível desconectar os cards." };
  }

  await logActivity(supabase, parsed.data.cardId, "card_disconnected", { other_card_id: parsed.data.otherCardId });
  await logActivity(supabase, parsed.data.otherCardId, "card_disconnected", { other_card_id: parsed.data.cardId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

/**
 * Autofill (M4): copia valores de `record_values` de um record CONECTADO
 * ao card para `card_field_values`, a partir de um mapeamento manual
 * `database_fields.key -> fields.id` informado pela UI no momento da
 * chamada (limitação documentada: não é um mapeamento salvo/reutilizável
 * — ver `autofillFromRecordSchema`). A lógica de resolução (o que copiar,
 * o que pular por incompatibilidade de tipo) é pura e testável — ver
 * `src/server/services/autofill.ts`; este action só faz I/O e auditoria.
 */
export async function autofillFromRecord(input: AutofillFromRecordInput): Promise<AutofillActionResult> {
  const parsed = autofillFromRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  // Reforça a mesma checagem cross-tenant usada pelas policies/triggers de
  // conexão — nunca confia apenas em "a conexão já existe" (CLAUDE.md §6).
  const { data: canConnect, error: authzError } = await supabase.rpc("can_connect_card_and_record", {
    target_card_id: parsed.data.cardId,
    target_record_id: parsed.data.recordId,
  });
  if (authzError || canConnect !== true) {
    return { success: false, error: "Sem permissão para preencher este card a partir deste registro." };
  }

  const { data: card } = await supabase
    .from("cards")
    .select("pipe_id")
    .eq("id", parsed.data.cardId)
    .maybeSingle<{ pipe_id: string }>();
  if (!card) {
    return { success: false, error: "Card não encontrado." };
  }

  const [cardFieldsRes, recordValuesRes] = await Promise.all([
    supabase.from("fields").select("id, type").eq("pipe_id", card.pipe_id).eq("is_archived", false),
    supabase
      .from("record_values")
      .select("database_field_id, value, database_fields(key, type)")
      .eq("record_id", parsed.data.recordId),
  ]);

  const cardFields: CardFieldTarget[] = ((cardFieldsRes.data ?? []) as { id: string; type: string }[]).map((f) => ({
    fieldId: f.id,
    type: f.type as FieldType,
  }));

  interface RecordValueRow {
    database_field_id: string;
    value: unknown;
    database_fields: { key: string; type: string } | null;
  }

  const recordFields: RecordFieldSnapshot[] = ((recordValuesRes.data ?? []) as unknown as RecordValueRow[])
    .filter((row) => row.database_fields !== null)
    .map((row) => ({
      databaseFieldId: row.database_field_id,
      key: row.database_fields!.key,
      type: row.database_fields!.type as FieldType,
      value: row.value,
    }));

  const mapping = parsed.data.mapping.map((m) => ({ databaseFieldKey: m.databaseFieldKey, fieldId: m.fieldId }));
  const result = resolveAutofill(mapping, recordFields, cardFields);

  if (result.applied.length > 0) {
    const { error: upsertError } = await supabase.from("card_field_values").upsert(
      result.applied.map((entry) => ({
        card_id: parsed.data.cardId,
        field_id: entry.fieldId,
        value: entry.value ?? null,
        updated_by: user.id,
      })),
      { onConflict: "card_id,field_id" },
    );
    if (upsertError) {
      return { success: false, error: "Não foi possível aplicar o autofill." };
    }

    await logActivity(supabase, parsed.data.cardId, "autofill_applied", {
      record_id: parsed.data.recordId,
      field_ids: result.applied.map((a) => a.fieldId),
      skipped: result.skipped,
    });
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true, applied: result.applied, skipped: result.skipped };
}

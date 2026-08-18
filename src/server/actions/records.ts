"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  archiveRecordSchema,
  createRecordSchema,
  isFieldValueEmpty,
  resolveRecordTitle,
  searchRecordsSchema,
  updateRecordFieldsSchema,
  validateFieldValue,
  type ArchiveRecordInput,
  type CreateRecordInput,
  type FieldType,
  type SearchRecordsInput,
  type UpdateRecordFieldsInput,
} from "@/lib/validation/databases";
import { listRecords, type RecordSummary } from "@/server/queries/databases";

export interface ActionResult {
  success: boolean;
  error?: string;
  recordId?: string;
}

interface DatabaseFieldRow {
  id: string;
  type: string;
  position: number;
  is_required: boolean;
  is_archived: boolean;
}

/** Carrega os campos ativos do database, para validar valores e calcular
 * título — reaproveita a mesma checagem por tipo de `fields`/`cards` (M2)
 * via `validateFieldValue`/`isFieldValueEmpty` (CLAUDE.md §3.19). */
async function loadDatabaseContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  databaseId: string,
): Promise<{ titleFieldId: string | null; fields: DatabaseFieldRow[] } | null> {
  const { data: database } = await supabase
    .from("databases")
    .select("id, title_field_id")
    .eq("id", databaseId)
    .maybeSingle<{ id: string; title_field_id: string | null }>();

  if (!database) {
    return null;
  }

  const { data: fields } = await supabase
    .from("database_fields")
    .select("id, type, position, is_required, is_archived")
    .eq("database_id", databaseId);

  return { titleFieldId: database.title_field_id, fields: (fields ?? []) as DatabaseFieldRow[] };
}

function validateValues(
  fields: readonly DatabaseFieldRow[],
  fieldValues: Record<string, unknown> | undefined,
): string | null {
  if (!fieldValues) return null;
  const fieldsById = new Map(fields.map((f) => [f.id, f]));

  for (const [fieldId, value] of Object.entries(fieldValues)) {
    const field = fieldsById.get(fieldId);
    if (!field || field.is_archived) {
      return "Um dos campos informados não existe neste database.";
    }
    // `type` vem do banco como `text` (validado pelo check constraint do catálogo fechado
    // de fieldTypes — ver database_fields_type_check); o cast para FieldType é seguro.
    const result = validateFieldValue(field.type as FieldType, value, { required: field.is_required });
    if (!result.valid) {
      return result.error ?? "Valor inválido para um dos campos.";
    }
  }

  // Campos obrigatórios ausentes do payload (não apenas com valor vazio).
  for (const field of fields) {
    if (field.is_archived || !field.is_required) continue;
    const provided = Object.prototype.hasOwnProperty.call(fieldValues, field.id);
    if (!provided) continue;
    if (isFieldValueEmpty(fieldValues[field.id])) {
      return "Preencha os campos obrigatórios.";
    }
  }

  return null;
}

export async function createRecord(input: CreateRecordInput): Promise<ActionResult> {
  const parsed = createRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const context = await loadDatabaseContext(supabase, parsed.data.databaseId);
  if (!context) {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const validationError = validateValues(context.fields, parsed.data.fieldValues);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const title = resolveRecordTitle(
    context.fields.map((f) => ({ id: f.id, type: f.type as FieldType, position: f.position, isArchived: f.is_archived })),
    parsed.data.fieldValues ?? {},
    context.titleFieldId,
  );

  const { data: record, error } = await supabase
    .from("records")
    .insert({ database_id: parsed.data.databaseId, title, created_by: user.id })
    .select("id")
    .single();

  if (error || !record) {
    return { success: false, error: "Não foi possível criar o registro." };
  }

  const recordId = (record as { id: string }).id;

  if (parsed.data.fieldValues) {
    const entries = Object.entries(parsed.data.fieldValues);
    if (entries.length > 0) {
      const { error: valuesError } = await supabase.from("record_values").insert(
        entries.map(([fieldId, value]) => ({
          record_id: recordId,
          database_field_id: fieldId,
          value: value ?? null,
          updated_by: user.id,
        })),
      );
      if (valuesError) {
        return { success: false, error: "Registro criado, mas houve erro ao salvar os campos." };
      }
    }
  }

  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true, recordId };
}

export async function updateRecordFields(input: UpdateRecordFieldsInput): Promise<ActionResult> {
  const parsed = updateRecordFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const context = await loadDatabaseContext(supabase, parsed.data.databaseId);
  if (!context) {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const validationError = validateValues(context.fields, parsed.data.fieldValues);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (parsed.data.fieldValues) {
    for (const [fieldId, value] of Object.entries(parsed.data.fieldValues)) {
      const { error } = await supabase.from("record_values").upsert(
        {
          record_id: parsed.data.recordId,
          database_field_id: fieldId,
          value: value ?? null,
          updated_by: user.id,
        },
        { onConflict: "record_id,database_field_id" },
      );
      if (error) {
        return { success: false, error: "Não foi possível salvar um dos campos do registro." };
      }
    }

    const { data: allValues } = await supabase
      .from("record_values")
      .select("database_field_id, value")
      .eq("record_id", parsed.data.recordId);

    const merged: Record<string, unknown> = {};
    for (const v of (allValues ?? []) as { database_field_id: string; value: unknown }[]) {
      merged[v.database_field_id] = v.value;
    }

    const title = resolveRecordTitle(
      context.fields.map((f) => ({
        id: f.id,
        type: f.type as FieldType,
        position: f.position,
        isArchived: f.is_archived,
      })),
      merged,
      context.titleFieldId,
    );

    const { error: titleError } = await supabase
      .from("records")
      .update({ title })
      .eq("id", parsed.data.recordId)
      .eq("database_id", parsed.data.databaseId);
    if (titleError) {
      return { success: false, error: "Não foi possível atualizar o título do registro." };
    }
  }

  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true };
}

/** Arquiva/desarquiva um registro (soft delete — CLAUDE.md §22). */
export async function archiveRecord(input: ArchiveRecordInput): Promise<ActionResult> {
  const parsed = archiveRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("records")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.recordId)
    .eq("database_id", parsed.data.databaseId);

  if (error) {
    return { success: false, error: "Não foi possível arquivar o registro." };
  }

  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true };
}

/** Busca/filtro básico de registros — delega para a query de leitura
 * (RLS decide o que é visível; esta action só valida entrada). */
export async function searchRecords(input: SearchRecordsInput): Promise<RecordSummary[]> {
  const parsed = searchRecordsSchema.safeParse(input);
  if (!parsed.success) {
    return [];
  }

  await requireAuth();
  return listRecords(parsed.data.databaseId, {
    query: parsed.data.query,
    fieldFilters: parsed.data.fieldFilters,
    includeArchived: parsed.data.includeArchived,
  });
}

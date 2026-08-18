"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  archiveDatabaseFieldSchema,
  archiveDatabaseSchema,
  createDatabaseFieldSchema,
  createDatabaseSchema,
  optionBasedFieldTypes,
  updateDatabaseFieldSchema,
  updateDatabaseSchema,
  type ArchiveDatabaseFieldInput,
  type ArchiveDatabaseInput,
  type CreateDatabaseFieldInput,
  type CreateDatabaseInput,
  type UpdateDatabaseFieldInput,
  type UpdateDatabaseInput,
} from "@/lib/validation/databases";

export interface ActionResult {
  success: boolean;
  error?: string;
  databaseId?: string;
}

/** Estrutura (nome, campos) de um database só pode ser gerenciada por
 * admin/super_admin da organização dona — mesmo padrão de
 * `requirePipeManager` em `src/server/actions/fields.ts` (M2). */
async function requireDatabaseManager(databaseId: string): Promise<void> {
  const supabase = await createClient();
  const { data: database } = await supabase
    .from("databases")
    .select("organization_id")
    .eq("id", databaseId)
    .maybeSingle<{ organization_id: string }>();

  if (!database) {
    throw new Error("Database não encontrado.");
  }
  await requireOrgRole(database.organization_id, ["super_admin", "admin"]);
}

export async function createDatabase(input: CreateDatabaseInput): Promise<ActionResult> {
  const parsed = createDatabaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("databases")
    .insert({
      organization_id: parsed.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o database." };
  }

  revalidatePath("/databases");
  return { success: true, databaseId: (data as { id: string }).id };
}

export async function updateDatabase(input: UpdateDatabaseInput): Promise<ActionResult> {
  const parsed = updateDatabaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDatabaseManager(parsed.data.databaseId);
  } catch {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.titleFieldId !== undefined) update.title_field_id = parsed.data.titleFieldId;

  const supabase = await createClient();
  const { error } = await supabase.from("databases").update(update).eq("id", parsed.data.databaseId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o database." };
  }

  revalidatePath("/databases");
  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true };
}

/** Arquiva/desarquiva um database (soft delete — CLAUDE.md §22). */
export async function archiveDatabase(input: ArchiveDatabaseInput): Promise<ActionResult> {
  const parsed = archiveDatabaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDatabaseManager(parsed.data.databaseId);
  } catch {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("databases")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.databaseId);

  if (error) {
    return { success: false, error: "Não foi possível arquivar o database." };
  }

  revalidatePath("/databases");
  return { success: true };
}

export async function createDatabaseField(input: CreateDatabaseFieldInput): Promise<ActionResult> {
  const parsed = createDatabaseFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDatabaseManager(parsed.data.databaseId);
  } catch {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const supabase = await createClient();

  const { data: maxPositionRow } = await supabase
    .from("database_fields")
    .select("position")
    .eq("database_id", parsed.data.databaseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const nextPosition = (maxPositionRow?.position ?? -1) + 1;

  const config: Record<string, unknown> = {};
  if (optionBasedFieldTypes.includes(parsed.data.type) && parsed.data.options?.length) {
    config.options = parsed.data.options;
  }

  const { data: field, error } = await supabase
    .from("database_fields")
    .insert({
      database_id: parsed.data.databaseId,
      label: parsed.data.label,
      key: parsed.data.key,
      type: parsed.data.type,
      is_required: parsed.data.isRequired,
      position: nextPosition,
      config,
    })
    .select("id")
    .single();

  if (error || !field) {
    if (error?.code === "23505") {
      return { success: false, error: "Já existe um campo com essa chave neste database." };
    }
    return { success: false, error: "Não foi possível criar o campo." };
  }

  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true };
}

export async function updateDatabaseField(input: UpdateDatabaseFieldInput): Promise<ActionResult> {
  const parsed = updateDatabaseFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDatabaseManager(parsed.data.databaseId);
  } catch {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.isRequired !== undefined) update.is_required = parsed.data.isRequired;
  if (parsed.data.position !== undefined) update.position = parsed.data.position;
  if (parsed.data.options !== undefined) update.config = { options: parsed.data.options };

  const supabase = await createClient();
  const { error } = await supabase
    .from("database_fields")
    .update(update)
    .eq("id", parsed.data.databaseFieldId)
    .eq("database_id", parsed.data.databaseId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o campo." };
  }

  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true };
}

/** Arquiva/desarquiva um campo de database (nunca excluído fisicamente —
 * preserva o histórico de record_values já preenchido, CLAUDE.md §22). */
export async function archiveDatabaseField(input: ArchiveDatabaseFieldInput): Promise<ActionResult> {
  const parsed = archiveDatabaseFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDatabaseManager(parsed.data.databaseId);
  } catch {
    return { success: false, error: "Database não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("database_fields")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.databaseFieldId)
    .eq("database_id", parsed.data.databaseId);

  if (error) {
    return { success: false, error: "Não foi possível arquivar o campo." };
  }

  revalidatePath(`/databases/${parsed.data.databaseId}`);
  return { success: true };
}

"use server";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  archiveFieldSchema,
  createFieldSchema,
  optionBasedFieldTypes,
  setPhaseFieldSchema,
  updateFieldSchema,
  type ArchiveFieldInput,
  type CreateFieldInput,
  type SetPhaseFieldInput,
  type UpdateFieldInput,
} from "@/lib/validation/fields";

export interface ActionResult {
  success: boolean;
  error?: string;
}

async function requirePipeManager(pipeId: string): Promise<void> {
  const supabase = await createClient();
  const { data: pipe } = await supabase
    .from("pipes")
    .select("organization_id")
    .eq("id", pipeId)
    .maybeSingle<{ organization_id: string }>();

  if (!pipe) {
    throw new Error("Pipe não encontrado.");
  }
  await requireOrgRole(pipe.organization_id, ["super_admin", "admin"]);
}

export async function createField(input: CreateFieldInput): Promise<ActionResult> {
  const parsed = createFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();

  const { data: maxPositionRow } = await supabase
    .from("fields")
    .select("position")
    .eq("pipe_id", parsed.data.pipeId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const nextPosition = (maxPositionRow?.position ?? -1) + 1;

  const { data: field, error } = await supabase
    .from("fields")
    .insert({
      pipe_id: parsed.data.pipeId,
      label: parsed.data.label,
      field_key: parsed.data.fieldKey,
      type: parsed.data.type,
      help_text: parsed.data.helpText ?? null,
      placeholder: parsed.data.placeholder ?? null,
      default_value: parsed.data.defaultValue ?? null,
      position: nextPosition,
    })
    .select("id")
    .single();

  if (error || !field) {
    if (error?.code === "23505") {
      return { success: false, error: "Já existe um campo com essa chave neste pipe." };
    }
    return { success: false, error: "Não foi possível criar o campo." };
  }

  if (optionBasedFieldTypes.includes(parsed.data.type) && parsed.data.options?.length) {
    const { error: optionsError } = await supabase.from("field_options").insert(
      parsed.data.options.map((option, index) => ({
        field_id: (field as { id: string }).id,
        value: option.value,
        label: option.label,
        position: index,
      })),
    );
    if (optionsError) {
      return { success: false, error: "Campo criado, mas houve erro ao salvar as opções." };
    }
  }

  return { success: true };
}

export async function updateField(input: UpdateFieldInput): Promise<ActionResult> {
  const parsed = updateFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.helpText !== undefined) update.help_text = parsed.data.helpText;
  if (parsed.data.placeholder !== undefined) update.placeholder = parsed.data.placeholder;
  if (parsed.data.defaultValue !== undefined) update.default_value = parsed.data.defaultValue;
  if (parsed.data.position !== undefined) update.position = parsed.data.position;

  const supabase = await createClient();
  const { error } = await supabase
    .from("fields")
    .update(update)
    .eq("id", parsed.data.fieldId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o campo." };
  }

  return { success: true };
}

/** Arquiva/desarquiva um campo. Nunca é excluído fisicamente — preserva o
 * histórico de `card_field_values` já preenchido (CLAUDE.md §22). */
export async function archiveField(input: ArchiveFieldInput): Promise<ActionResult> {
  const parsed = archiveFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("fields")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.fieldId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível arquivar o campo." };
  }

  return { success: true };
}

/** Define obrigatoriedade/visibilidade de um campo em uma fase específica. */
export async function setPhaseField(input: SetPhaseFieldInput): Promise<ActionResult> {
  const parsed = setPhaseFieldSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("phase_fields").upsert(
    {
      phase_id: parsed.data.phaseId,
      field_id: parsed.data.fieldId,
      is_required: parsed.data.isRequired,
      is_visible: parsed.data.isVisible,
    },
    { onConflict: "phase_id,field_id" },
  );

  if (error) {
    return { success: false, error: "Não foi possível configurar o campo nesta fase." };
  }

  return { success: true };
}

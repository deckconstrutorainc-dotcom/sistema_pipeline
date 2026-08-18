"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  addCommentSchema,
  archiveCardSchema,
  assignUserSchema,
  cardLabelSchema,
  createCardSchema,
  moveCardSchema,
  unassignUserSchema,
  updateCardFieldsSchema,
  type AddCommentInput,
  type ArchiveCardInput,
  type AssignUserInput,
  type CardLabelInput,
  type CreateCardInput,
  type MoveCardInput,
  type UnassignUserInput,
  type UpdateCardFieldsInput,
} from "@/lib/validation/cards";

export interface ActionResult {
  success: boolean;
  error?: string;
  cardId?: string;
}

/** Registra uma entrada de histórico via RPC SECURITY DEFINER `log_card_activity`
 * (ver migration `20260818090900_workflow_authz_helpers.sql`) — nunca via
 * INSERT direto (card_activities não expõe policy de INSERT ao client). */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await supabase.rpc("log_card_activity", { p_card_id: cardId, p_type: type, p_payload: payload });
}

export async function createCard(input: CreateCardInput): Promise<ActionResult> {
  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  let phaseId = parsed.data.phaseId;
  if (!phaseId) {
    const { data: initialPhase } = await supabase
      .from("phases")
      .select("id")
      .eq("pipe_id", parsed.data.pipeId)
      .eq("is_initial", true)
      .limit(1)
      .maybeSingle<{ id: string }>();
    phaseId = initialPhase?.id;
  }

  if (!phaseId) {
    return { success: false, error: "Este pipe ainda não possui uma fase inicial configurada." };
  }

  const { data: card, error } = await supabase
    .from("cards")
    .insert({
      pipe_id: parsed.data.pipeId,
      current_phase_id: phaseId,
      title: parsed.data.title,
      due_date: parsed.data.dueDate ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !card) {
    return { success: false, error: "Não foi possível criar o card." };
  }

  const cardId = (card as { id: string }).id;

  if (parsed.data.fieldValues) {
    const entries = Object.entries(parsed.data.fieldValues);
    if (entries.length > 0) {
      const { error: valuesError } = await supabase.from("card_field_values").insert(
        entries.map(([fieldId, value]) => ({
          card_id: cardId,
          field_id: fieldId,
          value: value ?? null,
          updated_by: user.id,
        })),
      );
      if (valuesError) {
        return { success: false, error: "Card criado, mas houve erro ao salvar os campos." };
      }
    }
  }

  await logActivity(supabase, cardId, "card_created", { title: parsed.data.title });

  revalidatePath(`/pipes/${parsed.data.pipeId}`);
  return { success: true, cardId };
}

export async function updateCardFields(input: UpdateCardFieldsInput): Promise<ActionResult> {
  const parsed = updateCardFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const cardUpdate: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) cardUpdate.title = parsed.data.title;
  if (parsed.data.dueDate !== undefined) cardUpdate.due_date = parsed.data.dueDate;

  if (Object.keys(cardUpdate).length > 0) {
    const { error } = await supabase
      .from("cards")
      .update(cardUpdate)
      .eq("id", parsed.data.cardId)
      .eq("pipe_id", parsed.data.pipeId);
    if (error) {
      return { success: false, error: "Não foi possível atualizar o card." };
    }
  }

  if (parsed.data.fieldValues) {
    for (const [fieldId, value] of Object.entries(parsed.data.fieldValues)) {
      const { error } = await supabase.from("card_field_values").upsert(
        {
          card_id: parsed.data.cardId,
          field_id: fieldId,
          value: value ?? null,
          updated_by: user.id,
        },
        { onConflict: "card_id,field_id" },
      );
      if (error) {
        return { success: false, error: "Não foi possível salvar um dos campos do card." };
      }
    }
    await logActivity(supabase, parsed.data.cardId, "field_updated", {
      field_ids: Object.keys(parsed.data.fieldValues),
    });
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

/**
 * Move um card entre fases via RPC `move_card` (transação atômica no
 * banco — ver CLAUDE.md §10 e comentário na migration
 * `20260818091000_move_card_rpc.sql`). Qualquer falha de validação
 * (autorização, fase inválida, campo obrigatório faltando) retorna aqui
 * como `success: false` com a mensagem do banco, sem deixar estado
 * parcial — a própria função SQL reverte tudo.
 */
export async function moveCard(input: MoveCardInput): Promise<ActionResult> {
  const parsed = moveCardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.rpc("move_card", {
    p_card_id: parsed.data.cardId,
    p_target_phase_id: parsed.data.targetPhaseId,
  });

  if (error) {
    return { success: false, error: error.message || "Não foi possível mover o card." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}`);
  return { success: true };
}

export async function assignUser(input: AssignUserInput): Promise<ActionResult> {
  const parsed = assignUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from("card_assignments").insert({
    card_id: parsed.data.cardId,
    user_id: parsed.data.userId,
    assigned_by: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Usuário já é responsável por este card." };
    }
    return { success: false, error: "Não foi possível atribuir o responsável." };
  }

  await logActivity(supabase, parsed.data.cardId, "assigned", { user_id: parsed.data.userId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function unassignUser(input: UnassignUserInput): Promise<ActionResult> {
  const parsed = unassignUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("card_assignments")
    .delete()
    .eq("card_id", parsed.data.cardId)
    .eq("user_id", parsed.data.userId);

  if (error) {
    return { success: false, error: "Não foi possível remover o responsável." };
  }

  await logActivity(supabase, parsed.data.cardId, "unassigned", { user_id: parsed.data.userId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function addLabel(input: CardLabelInput): Promise<ActionResult> {
  const parsed = cardLabelSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("card_labels")
    .insert({ card_id: parsed.data.cardId, label_id: parsed.data.labelId });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Label já aplicada a este card." };
    }
    return { success: false, error: "Não foi possível aplicar a label." };
  }

  await logActivity(supabase, parsed.data.cardId, "label_added", { label_id: parsed.data.labelId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function removeLabel(input: CardLabelInput): Promise<ActionResult> {
  const parsed = cardLabelSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("card_labels")
    .delete()
    .eq("card_id", parsed.data.cardId)
    .eq("label_id", parsed.data.labelId);

  if (error) {
    return { success: false, error: "Não foi possível remover a label." };
  }

  await logActivity(supabase, parsed.data.cardId, "label_removed", { label_id: parsed.data.labelId });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function addComment(input: AddCommentInput): Promise<ActionResult> {
  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from("comments").insert({
    card_id: parsed.data.cardId,
    author_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    return { success: false, error: "Não foi possível adicionar o comentário." };
  }

  await logActivity(supabase, parsed.data.cardId, "comment_added", {});
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

/** Arquiva/desarquiva um card (soft delete — CLAUDE.md §22). */
export async function archiveCard(input: ArchiveCardInput): Promise<ActionResult> {
  const parsed = archiveCardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("cards")
    .update({ is_archived: parsed.data.isArchived })
    .eq("id", parsed.data.cardId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível arquivar o card." };
  }

  await logActivity(
    supabase,
    parsed.data.cardId,
    parsed.data.isArchived ? "card_archived" : "card_unarchived",
    {},
  );
  revalidatePath(`/pipes/${parsed.data.pipeId}`);
  return { success: true };
}

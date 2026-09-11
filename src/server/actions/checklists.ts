"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  addChecklistItemSchema,
  deleteChecklistItemSchema,
  toggleChecklistItemSchema,
  updateChecklistItemTitleSchema,
  type AddChecklistItemInput,
  type DeleteChecklistItemInput,
  type ToggleChecklistItemInput,
  type UpdateChecklistItemTitleInput,
} from "@/lib/validation/checklists";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/** Mesmo helper de `src/server/actions/cards.ts` — registra histórico via
 * RPC SECURITY DEFINER `log_card_activity` (nunca via INSERT direto). */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await supabase.rpc("log_card_activity", { p_card_id: cardId, p_type: type, p_payload: payload });
}

/**
 * Adiciona um item ao checklist do card. Sem `.select()` encadeado ao
 * INSERT — a UI é atualizada via `router.refresh()` + refetch da lista
 * completa (mesmo padrão de `addComment` em `src/server/actions/cards.ts`),
 * evitando qualquer dependência de RETURNING logo após o INSERT.
 */
export async function addChecklistItem(input: AddChecklistItemInput): Promise<ActionResult> {
  const parsed = addChecklistItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const { count } = await supabase
    .from("checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("card_id", parsed.data.cardId);

  const { error } = await supabase.from("checklist_items").insert({
    card_id: parsed.data.cardId,
    title: parsed.data.title,
    position: count ?? 0,
    created_by: user.id,
  });

  if (error) {
    return { success: false, error: "Não foi possível adicionar o item do checklist." };
  }

  await logActivity(supabase, parsed.data.cardId, "checklist_item_added", { title: parsed.data.title });
  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

/** Marca/desmarca um item como concluído. Registra atividade apenas ao
 * concluir (não ao desmarcar), espelhando a semântica de `card_completed`. */
export async function toggleChecklistItem(input: ToggleChecklistItemInput): Promise<ActionResult> {
  const parsed = toggleChecklistItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("checklist_items")
    .update({ is_done: parsed.data.isDone })
    .eq("id", parsed.data.itemId)
    .eq("card_id", parsed.data.cardId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o item do checklist." };
  }

  if (parsed.data.isDone) {
    await logActivity(supabase, parsed.data.cardId, "checklist_item_completed", { item_id: parsed.data.itemId });
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function updateChecklistItemTitle(input: UpdateChecklistItemTitleInput): Promise<ActionResult> {
  const parsed = updateChecklistItemTitleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("checklist_items")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.itemId)
    .eq("card_id", parsed.data.cardId);

  if (error) {
    return { success: false, error: "Não foi possível renomear o item do checklist." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

export async function deleteChecklistItem(input: DeleteChecklistItemInput): Promise<ActionResult> {
  const parsed = deleteChecklistItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("checklist_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .eq("card_id", parsed.data.cardId);

  if (error) {
    return { success: false, error: "Não foi possível remover o item do checklist." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

// Nota: `reorderChecklistItems` não foi implementado nesta etapa —
// simplificação aceita (CLAUDE.md §2: "trabalhe por módulos", evitar
// escopo maior que o necessário). A ordem exibida hoje é por `position`
// (sempre incrementada no fim da lista na criação) e, secundariamente,
// `created_at` — ou seja, ordem de criação. Reordenar por drag-and-drop
// fica como próximo passo caso seja pedido explicitamente.

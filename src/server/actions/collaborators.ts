"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  error?: string;
}

const inviteSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  userId: z.string().uuid("Usuário inválido."),
  request: z.string().trim().max(500, "Pedido muito longo.").optional(),
});

export type InviteCollaboratorInput = z.infer<typeof inviteSchema>;

/**
 * Convida alguém de outro setor a colaborar neste card.
 *
 * Concede acesso APENAS a este card — não ao pipe. Quem convida precisa ser
 * membro do pipe; a RLS é que decide, esta action só traduz o erro.
 */
export async function inviteCollaborator(input: InviteCollaboratorInput): Promise<ActionResult> {
  const user = await requireAuth();

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("card_collaborators").insert({
    card_id: parsed.data.cardId,
    user_id: parsed.data.userId,
    invited_by: user.id,
    request: parsed.data.request?.trim() || null,
  });

  if (error) {
    // 23505 = violação de unicidade: já existe convite para esta pessoa.
    if (error.code === "23505") {
      return { success: false, error: "Esta pessoa já foi convidada para esta atividade." };
    }
    return { success: false, error: error.message };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

const removeSchema = z.object({
  collaboratorId: z.string().uuid(),
  cardId: z.string().uuid(),
  pipeId: z.string().uuid(),
});

export async function removeCollaborator(
  input: z.infer<typeof removeSchema>,
): Promise<ActionResult> {
  await requireAuth();

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("card_collaborators")
    .delete()
    .eq("id", parsed.data.collaboratorId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/pipes/${parsed.data.pipeId}/cards/${parsed.data.cardId}`);
  return { success: true };
}

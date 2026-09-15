"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Marca uma notificação como lida.
 *
 * A RLS só deixa o usuário alterar as próprias linhas, e o privilégio de
 * coluna limita a alteração a `read_at` — a action não precisa (nem deve)
 * repetir essa checagem.
 */
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/notifications");
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/notifications");
  return { success: true };
}

export async function deleteNotification(notificationId: string): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").delete().eq("id", notificationId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/notifications");
  return { success: true };
}

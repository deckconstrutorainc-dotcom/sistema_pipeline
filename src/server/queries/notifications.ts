import { createClient } from "@/lib/supabase/server";

export type NotificationType =
  | "card_assigned"
  | "comment_added"
  | "attachment_added"
  | "card_due_soon"
  | "card_overdue"
  | "related_card_completed"
  | "automation";

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  cardId: string | null;
  /**
   * Null quando o card não existe mais ou o usuário perdeu acesso a ele
   * (a RLS de `cards` esconde a linha) — nesse caso a notificação não vira
   * link.
   */
  pipeId: string | null;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  card_id: string | null;
  cards: { pipe_id: string } | { pipe_id: string }[] | null;
}

function pipeIdOf(cards: NotificationRow["cards"]): string | null {
  if (!cards) return null;
  if (Array.isArray(cards)) return cards[0]?.pipe_id ?? null;
  return cards.pipe_id;
}

/**
 * Notificações do usuário logado, mais recentes primeiro.
 * A RLS garante que só as próprias voltam — não há filtro por usuário aqui
 * de propósito, para não dar a impressão de que a segurança vive na query.
 */
export async function listNotifications(limit = 30): Promise<NotificationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, read_at, created_at, card_id, cards(pipe_id)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao carregar notificações: ${error.message}`);

  return ((data ?? []) as unknown as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
    cardId: row.card_id,
    pipeId: pipeIdOf(row.cards),
  }));
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw new Error(`Falha ao contar notificações: ${error.message}`);
  return count ?? 0;
}

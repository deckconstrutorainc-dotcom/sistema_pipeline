import { createClient } from "@/lib/supabase/server";

export interface EmailMessageSummary {
  id: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddresses: string[];
  body: string;
  status: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

export interface EmailThreadSummary {
  id: string;
  subject: string;
  createdAt: string;
  messages: EmailMessageSummary[];
}

/** Carrega as threads de e-mail de um card (RLS: membros do pipe do card —
 * ver `email_threads_select`/`email_messages_select`, M5). */
export async function getEmailThreadsForCard(cardId: string): Promise<EmailThreadSummary[]> {
  const supabase = await createClient();

  const { data: threads, error } = await supabase
    .from("email_threads")
    .select("id, subject, created_at")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false });

  if (error || !threads || threads.length === 0) {
    return [];
  }

  const threadRows = threads as unknown as { id: string; subject: string; created_at: string }[];
  const threadIds = threadRows.map((t) => t.id);

  const { data: messages } = await supabase
    .from("email_messages")
    .select(
      "id, thread_id, direction, from_address, to_addresses, body, status, sent_at, received_at, created_at",
    )
    .in("thread_id", threadIds)
    .order("created_at", { ascending: true });

  const messagesByThread = new Map<string, EmailMessageSummary[]>();
  for (const row of (messages ?? []) as unknown as {
    id: string;
    thread_id: string;
    direction: "inbound" | "outbound";
    from_address: string;
    to_addresses: string[];
    body: string;
    status: string;
    sent_at: string | null;
    received_at: string | null;
    created_at: string;
  }[]) {
    const list = messagesByThread.get(row.thread_id) ?? [];
    list.push({
      id: row.id,
      direction: row.direction,
      fromAddress: row.from_address,
      toAddresses: row.to_addresses,
      body: row.body,
      status: row.status,
      sentAt: row.sent_at,
      receivedAt: row.received_at,
      createdAt: row.created_at,
    });
    messagesByThread.set(row.thread_id, list);
  }

  return threadRows.map((thread) => ({
    id: thread.id,
    subject: thread.subject,
    createdAt: thread.created_at,
    messages: messagesByThread.get(thread.id) ?? [],
  }));
}

import { createClient } from "@/lib/supabase/server";

export interface CardActivityEntry {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  actorId: string | null;
  createdAt: string;
}

export interface CardCommentEntry {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface CardAttachmentEntry {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export interface CardDetail {
  id: string;
  pipeId: string;
  pipeName: string;
  currentPhaseId: string;
  number: number;
  title: string;
  dueDate: string | null;
  isArchived: boolean;
  isDone: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fieldValues: Record<string, unknown>;
  labelIds: string[];
  assigneeIds: string[];
  comments: CardCommentEntry[];
  attachments: CardAttachmentEntry[];
  activities: CardActivityEntry[];
}

/**
 * Carrega os dados de um card para a página de detalhe (URL compartilhável).
 * Retorna `null` quando o card não existe ou o usuário não tem acesso
 * (mesma postura de `getPipeBoardData`: RLS decide, sem distinguir
 * "inexistente" de "sem permissão" na resposta).
 */
export async function getCardDetail(cardId: string): Promise<CardDetail | null> {
  const supabase = await createClient();

  const { data: cardRow, error } = await supabase
    .from("cards")
    .select(
      "id, pipe_id, current_phase_id, number, title, due_date, is_archived, is_done, created_by, created_at, updated_at, pipes(name)",
    )
    .eq("id", cardId)
    .maybeSingle<{
      id: string;
      pipe_id: string;
      current_phase_id: string;
      number: number;
      title: string;
      due_date: string | null;
      is_archived: boolean;
      is_done: boolean;
      created_by: string;
      created_at: string;
      updated_at: string;
      pipes: { name: string } | null;
    }>();

  if (error || !cardRow) {
    return null;
  }

  const [valuesRes, labelsRes, assignmentsRes, commentsRes, attachmentsRes, activitiesRes] =
    await Promise.all([
      supabase.from("card_field_values").select("field_id, value").eq("card_id", cardId),
      supabase.from("card_labels").select("label_id").eq("card_id", cardId),
      supabase.from("card_assignments").select("user_id").eq("card_id", cardId),
      supabase
        .from("comments")
        .select("id, author_id, body, created_at")
        .eq("card_id", cardId)
        .order("created_at", { ascending: true }),
      supabase
        .from("attachments")
        .select("id, file_name, mime_type, size_bytes, uploaded_by, created_at")
        .eq("card_id", cardId)
        .order("created_at", { ascending: true }),
      supabase
        .from("card_activities")
        .select("id, type, payload, actor_id, created_at")
        .eq("card_id", cardId)
        .order("created_at", { ascending: false }),
    ]);

  const fieldValues: Record<string, unknown> = {};
  for (const row of (valuesRes.data ?? []) as { field_id: string; value: unknown }[]) {
    fieldValues[row.field_id] = row.value;
  }

  return {
    id: cardRow.id,
    pipeId: cardRow.pipe_id,
    pipeName: cardRow.pipes?.name ?? "",
    currentPhaseId: cardRow.current_phase_id,
    number: cardRow.number,
    title: cardRow.title,
    dueDate: cardRow.due_date,
    isArchived: cardRow.is_archived,
    isDone: cardRow.is_done,
    createdBy: cardRow.created_by,
    createdAt: cardRow.created_at,
    updatedAt: cardRow.updated_at,
    fieldValues,
    labelIds: ((labelsRes.data ?? []) as { label_id: string }[]).map((r) => r.label_id),
    assigneeIds: ((assignmentsRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
    comments: ((commentsRes.data ?? []) as {
      id: string;
      author_id: string;
      body: string;
      created_at: string;
    }[]).map((r) => ({ id: r.id, authorId: r.author_id, body: r.body, createdAt: r.created_at })),
    attachments: ((attachmentsRes.data ?? []) as {
      id: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      uploaded_by: string;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
    })),
    activities: ((activitiesRes.data ?? []) as {
      id: string;
      type: string;
      payload: Record<string, unknown>;
      actor_id: string | null;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      type: r.type,
      payload: r.payload,
      actorId: r.actor_id,
      createdAt: r.created_at,
    })),
  };
}

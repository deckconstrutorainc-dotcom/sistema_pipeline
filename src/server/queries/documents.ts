import { createClient } from "@/lib/supabase/server";

export interface DocumentTemplateSummary {
  id: string;
  organizationId: string;
  pipeId: string | null;
  name: string;
  description: string | null;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function mapTemplateRow(row: {
  id: string;
  organization_id: string;
  pipe_id: string | null;
  name: string;
  description: string | null;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}): DocumentTemplateSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    pipeId: row.pipe_id,
    name: row.name,
    description: row.description,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Templates visíveis para um pipe: os específicos do pipe + os genéricos da organização (pipe_id null). */
export async function listDocumentTemplatesForPipe(
  organizationId: string,
  pipeId: string,
): Promise<DocumentTemplateSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, organization_id, pipe_id, name, description, body, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .or(`pipe_id.eq.${pipeId},pipe_id.is.null`)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Parameters<typeof mapTemplateRow>[0][]).map(mapTemplateRow);
}

export async function getDocumentTemplate(templateId: string): Promise<DocumentTemplateSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, organization_id, pipe_id, name, description, body, created_by, created_at, updated_at")
    .eq("id", templateId)
    .maybeSingle<Parameters<typeof mapTemplateRow>[0]>();

  if (error || !data) return null;
  return mapTemplateRow(data);
}

export interface GeneratedDocumentSummary {
  id: string;
  templateId: string;
  cardId: string;
  generatedBy: string;
  storagePath: string | null;
  status: "pending" | "generated" | "failed";
  errorMessage: string | null;
  createdAt: string;
}

export async function listGeneratedDocumentsForCard(cardId: string): Promise<GeneratedDocumentSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("generated_documents")
    .select("id, template_id, card_id, generated_by, storage_path, status, error_message, created_at")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (
    data as unknown as {
      id: string;
      template_id: string;
      card_id: string;
      generated_by: string;
      storage_path: string | null;
      status: "pending" | "generated" | "failed";
      error_message: string | null;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    cardId: row.card_id,
    generatedBy: row.generated_by,
    storagePath: row.storage_path,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }));
}

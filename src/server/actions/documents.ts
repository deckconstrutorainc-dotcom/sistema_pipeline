"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createDocumentTemplateSchema,
  generateDocumentSchema,
  updateDocumentTemplateSchema,
  type CreateDocumentTemplateInput,
  type GenerateDocumentInput,
  type UpdateDocumentTemplateInput,
} from "@/lib/validation/documents";
import { renderDocumentTemplate } from "@/server/services/documents";

export interface ActionResult {
  success: boolean;
  error?: string;
  templateId?: string;
  documentId?: string;
}

async function requireTemplateManager(templateId: string): Promise<void> {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("document_templates")
    .select("organization_id")
    .eq("id", templateId)
    .maybeSingle<{ organization_id: string }>();

  if (!template) {
    throw new Error("Template não encontrado.");
  }
  await requireOrgRole(template.organization_id, ["super_admin", "admin"]);
}

export async function createDocumentTemplate(input: CreateDocumentTemplateInput): Promise<ActionResult> {
  const parsed = createDocumentTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_templates")
    .insert({
      organization_id: parsed.data.organizationId,
      pipe_id: parsed.data.pipeId ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      body: parsed.data.body,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o template." };
  }

  if (parsed.data.pipeId) {
    revalidatePath(`/pipes/${parsed.data.pipeId}/documents`);
  }
  return { success: true, templateId: (data as { id: string }).id };
}

export async function updateDocumentTemplate(input: UpdateDocumentTemplateInput): Promise<ActionResult> {
  const parsed = updateDocumentTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireTemplateManager(parsed.data.templateId);
  } catch {
    return { success: false, error: "Template não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.body !== undefined) update.body = parsed.data.body;

  const supabase = await createClient();
  const { error } = await supabase
    .from("document_templates")
    .update(update)
    .eq("id", parsed.data.templateId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o template." };
  }

  return { success: true, templateId: parsed.data.templateId };
}

/**
 * Gera um documento a partir de um template + card:
 *   1. Confirma acesso ao template e ao card via client autenticado normal
 *      (RLS decide) — nunca confia apenas em "está autenticado".
 *   2. Insere a linha em `generated_documents` com status 'pending' via
 *      client administrativo (a tabela não tem policy de INSERT para
 *      `authenticated` — ver `20260818094200_analytics_rls_policies.sql`).
 *   3. Resolve os placeholders com `renderDocumentTemplate` (função pura).
 *   4. Tenta persistir o resultado no Supabase Storage. SEM bucket
 *      configurado neste ambiente (mesma pendência de infraestrutura já
 *      documentada em `attachments.sql`, M2), a tentativa de upload falha
 *      de verdade — a linha é marcada 'failed' com o erro real, NUNCA
 *      'generated' de forma simulada (CLAUDE.md §15/§24: nunca fingir
 *      sucesso de persistência).
 */
export async function generateDocument(input: GenerateDocumentInput): Promise<ActionResult> {
  const parsed = generateDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const userClient = await createClient();

  const { data: template, error: templateError } = await userClient
    .from("document_templates")
    .select("id, organization_id, pipe_id, body")
    .eq("id", parsed.data.templateId)
    .maybeSingle<{ id: string; organization_id: string; pipe_id: string | null; body: string }>();

  if (templateError || !template) {
    return { success: false, error: "Template não encontrado ou sem permissão de acesso." };
  }

  const { data: card, error: cardError } = await userClient
    .from("cards")
    .select("id, pipe_id, number, title, due_date, created_at")
    .eq("id", parsed.data.cardId)
    .maybeSingle<{
      id: string;
      pipe_id: string;
      number: number;
      title: string;
      due_date: string | null;
      created_at: string;
    }>();

  if (cardError || !card) {
    return { success: false, error: "Card não encontrado ou sem permissão de acesso." };
  }

  if (template.pipe_id && template.pipe_id !== card.pipe_id) {
    return { success: false, error: "Este template é específico de outro pipe." };
  }

  const [{ data: fieldValueRows }, { data: fieldRows }] = await Promise.all([
    userClient.from("card_field_values").select("field_id, value").eq("card_id", card.id),
    userClient.from("fields").select("id, field_key").eq("pipe_id", card.pipe_id),
  ]);

  const fieldKeyById = new Map(
    ((fieldRows ?? []) as { id: string; field_key: string }[]).map((f) => [f.id, f.field_key]),
  );
  const fieldValuesByKey: Record<string, unknown> = {};
  for (const row of (fieldValueRows ?? []) as { field_id: string; value: unknown }[]) {
    const key = fieldKeyById.get(row.field_id);
    if (key) fieldValuesByKey[key] = row.value;
  }

  const admin = createAdminClient();

  const { data: docRow, error: insertError } = await admin
    .from("generated_documents")
    .insert({
      template_id: template.id,
      card_id: card.id,
      generated_by: user.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !docRow) {
    return { success: false, error: "Não foi possível iniciar a geração do documento." };
  }
  const documentId = (docRow as { id: string }).id;

  const rendered = renderDocumentTemplate({
    body: template.body,
    card: {
      title: card.title,
      number: card.number,
      dueDate: card.due_date,
      createdAt: card.created_at,
    },
    fieldValuesByKey,
  });

  const storagePath = `${template.organization_id}/${card.pipe_id}/${card.id}/${documentId}.html`;

  const upload = await admin.storage
    .from("generated-documents")
    .upload(storagePath, new Blob([rendered], { type: "text/html" }), {
      contentType: "text/html",
      upsert: false,
    });

  if (upload.error) {
    await admin
      .from("generated_documents")
      .update({ status: "failed", error_message: upload.error.message })
      .eq("id", documentId);

    await admin.from("card_activities").insert({
      card_id: card.id,
      actor_id: user.id,
      type: "document_generated",
      payload: { template_id: template.id, document_id: documentId, status: "failed" },
    });

    return {
      success: false,
      error:
        "Documento renderizado, mas não foi possível salvá-lo no Storage (bucket 'generated-documents' " +
        "provavelmente não está configurado neste ambiente).",
      documentId,
    };
  }

  await admin
    .from("generated_documents")
    .update({ status: "generated", storage_path: storagePath })
    .eq("id", documentId);

  await admin.from("card_activities").insert({
    card_id: card.id,
    actor_id: user.id,
    type: "document_generated",
    payload: { template_id: template.id, document_id: documentId, status: "generated" },
  });

  revalidatePath(`/pipes/${card.pipe_id}/cards/${card.id}`);
  revalidatePath(`/pipes/${card.pipe_id}/documents`);
  return { success: true, documentId };
}

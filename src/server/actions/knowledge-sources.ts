"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createKnowledgeSourceSchema,
  deleteKnowledgeSourceSchema,
  type CreateKnowledgeSourceInput,
  type DeleteKnowledgeSourceInput,
} from "@/lib/validation/ai";

export interface ActionResult {
  success: boolean;
  error?: string;
  knowledgeSourceId?: string;
}

export interface KnowledgeSourceSummary {
  id: string;
  organizationId: string;
  aiAgentId: string | null;
  name: string;
  sourceType: string;
  content: string | null;
  storagePath: string | null;
  createdAt: string;
}

/**
 * Cria uma fonte de conhecimento (CLAUDE.md §17 "knowledge base"). Admin/
 * super_admin apenas. Nesta primeira versão só `manual_text` tem um
 * caminho de criação via UI (texto colado direto) — `document`/`url`/
 * `database_table` existem no schema para uso futuro (upload de arquivo,
 * snapshot de URL, espelho de tabela de database) mas exigem
 * infraestrutura adicional (Storage configurado, fetch externo) fora do
 * escopo deste milestone.
 */
export async function createKnowledgeSource(input: CreateKnowledgeSourceInput): Promise<ActionResult> {
  const parsed = createKnowledgeSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  if (parsed.data.aiAgentId) {
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("organization_id")
      .eq("id", parsed.data.aiAgentId)
      .maybeSingle<{ organization_id: string }>();
    if (!agent || agent.organization_id !== parsed.data.organizationId) {
      return { success: false, error: "Agente não encontrado nesta organização." };
    }
  }

  const { data, error } = await supabase
    .from("knowledge_sources")
    .insert({
      organization_id: parsed.data.organizationId,
      ai_agent_id: parsed.data.aiAgentId ?? null,
      name: parsed.data.name,
      source_type: parsed.data.sourceType,
      content: parsed.data.content ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar a fonte de conhecimento." };
  }

  revalidatePath("/settings/ai-agents");
  return { success: true, knowledgeSourceId: (data as { id: string }).id };
}

export async function deleteKnowledgeSource(input: DeleteKnowledgeSourceInput): Promise<ActionResult> {
  const parsed = deleteKnowledgeSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("knowledge_sources")
    .delete()
    .eq("id", parsed.data.knowledgeSourceId)
    .eq("organization_id", parsed.data.organizationId);

  if (error) {
    return { success: false, error: "Não foi possível remover a fonte de conhecimento." };
  }

  revalidatePath("/settings/ai-agents");
  return { success: true };
}

/** Lista as fontes de conhecimento da organização — RLS já restringe a
 * membros ativos. */
export async function listKnowledgeSources(organizationId: string): Promise<KnowledgeSourceSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("id, organization_id, ai_agent_id, name, source_type, content, storage_path, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      organization_id: string;
      ai_agent_id: string | null;
      name: string;
      source_type: string;
      content: string | null;
      storage_path: string | null;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    aiAgentId: row.ai_agent_id,
    name: row.name,
    sourceType: row.source_type,
    content: row.content,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  }));
}

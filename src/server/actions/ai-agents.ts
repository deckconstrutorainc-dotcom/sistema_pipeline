"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createAiAgentSchema,
  toggleAiAgentSchema,
  updateAiAgentSchema,
  type CreateAiAgentInput,
  type ToggleAiAgentInput,
  type UpdateAiAgentInput,
} from "@/lib/validation/ai";

export interface ActionResult {
  success: boolean;
  error?: string;
  agentId?: string;
}

export interface AiAgentSummary {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  instructions: string;
  allowedTools: string[];
  pipeId: string | null;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cria um agente de IA (CLAUDE.md §17). Admin/super_admin apenas —
 * reforçado aqui E pela policy `ai_agents_insert` (RLS). A allowlist de
 * tools já foi validada contra `TOOL_NAMES` em `createAiAgentSchema`.
 */
export async function createAiAgent(input: CreateAiAgentInput): Promise<ActionResult> {
  const parsed = createAiAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  if (parsed.data.pipeId) {
    const { data: pipe } = await supabase
      .from("pipes")
      .select("organization_id")
      .eq("id", parsed.data.pipeId)
      .maybeSingle<{ organization_id: string }>();
    if (!pipe || pipe.organization_id !== parsed.data.organizationId) {
      return { success: false, error: "Pipe não encontrado nesta organização." };
    }
  }

  const { data, error } = await supabase
    .from("ai_agents")
    .insert({
      organization_id: parsed.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      instructions: parsed.data.instructions,
      allowed_tools: parsed.data.allowedTools,
      pipe_id: parsed.data.pipeId ?? null,
      requires_approval: parsed.data.requiresApproval,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o agente de IA." };
  }

  revalidatePath("/settings/ai-agents");
  return { success: true, agentId: (data as { id: string }).id };
}

export async function updateAiAgent(input: UpdateAiAgentInput): Promise<ActionResult> {
  const parsed = updateAiAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  if (parsed.data.pipeId) {
    const { data: pipe } = await supabase
      .from("pipes")
      .select("organization_id")
      .eq("id", parsed.data.pipeId)
      .maybeSingle<{ organization_id: string }>();
    if (!pipe || pipe.organization_id !== parsed.data.organizationId) {
      return { success: false, error: "Pipe não encontrado nesta organização." };
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.instructions !== undefined) update.instructions = parsed.data.instructions;
  if (parsed.data.allowedTools !== undefined) update.allowed_tools = parsed.data.allowedTools;
  if (parsed.data.pipeId !== undefined) update.pipe_id = parsed.data.pipeId;
  if (parsed.data.requiresApproval !== undefined) update.requires_approval = parsed.data.requiresApproval;

  const { error } = await supabase
    .from("ai_agents")
    .update(update)
    .eq("id", parsed.data.agentId)
    .eq("organization_id", parsed.data.organizationId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o agente de IA." };
  }

  revalidatePath("/settings/ai-agents");
  return { success: true, agentId: parsed.data.agentId };
}

/** Ativa/desativa um agente. Nunca excluído via client (CLAUDE.md §22) —
 * preserva o histórico de `ai_runs` que o referenciam. */
export async function toggleAiAgent(input: ToggleAiAgentInput): Promise<ActionResult> {
  const parsed = toggleAiAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("ai_agents")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.agentId)
    .eq("organization_id", parsed.data.organizationId);

  if (error) {
    return { success: false, error: "Não foi possível alterar o status do agente." };
  }

  revalidatePath("/settings/ai-agents");
  return { success: true, agentId: parsed.data.agentId };
}

/** Lista os agentes da organização — RLS (`ai_agents_select`) já restringe
 * a membros ativos da organização. */
export async function listAiAgents(organizationId: string): Promise<AiAgentSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_agents")
    .select(
      "id, organization_id, name, description, instructions, allowed_tools, pipe_id, requires_approval, is_active, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      organization_id: string;
      name: string;
      description: string | null;
      instructions: string;
      allowed_tools: string[];
      pipe_id: string | null;
      requires_approval: boolean;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    allowedTools: row.allowed_tools ?? [],
    pipeId: row.pipe_id,
    requiresApproval: row.requires_approval,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

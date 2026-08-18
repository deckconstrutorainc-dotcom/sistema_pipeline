"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  configurePortalItemsSchema,
  createPortalSchema,
  togglePortalSchema,
  updatePortalSchema,
  type ConfigurePortalItemsInput,
  type CreatePortalInput,
  type TogglePortalInput,
  type UpdatePortalInput,
} from "@/lib/validation/portals";

export interface ActionResult {
  success: boolean;
  error?: string;
  portalId?: string;
}

/** Gerenciar um portal (criar/editar/ativar, configurar campos) exige
 * admin/super_admin da organização dona do PIPE do portal — mesmo nível de
 * `can_manage_pipe_structure` (M2) / `requireDatabaseManager` (M4). */
async function requirePipeOrganization(pipeId: string): Promise<string> {
  const supabase = await createClient();
  const { data: pipe } = await supabase
    .from("pipes")
    .select("organization_id")
    .eq("id", pipeId)
    .maybeSingle<{ organization_id: string }>();

  if (!pipe) {
    throw new Error("Pipe não encontrado.");
  }
  return pipe.organization_id;
}

async function requirePortalOrganization(portalId: string): Promise<string> {
  const supabase = await createClient();
  const { data: portal } = await supabase
    .from("portals")
    .select("organization_id")
    .eq("id", portalId)
    .maybeSingle<{ organization_id: string }>();

  if (!portal) {
    throw new Error("Portal não encontrado.");
  }
  return portal.organization_id;
}

/** Hash sha256 hex do código de acesso — nunca gravamos o código em claro
 * (mesma postura documentada na migration `20260818092900_portals.sql`).
 * Usa Web Crypto (disponível no runtime Node do Next.js), sem dependência
 * externa nova (CLAUDE.md §21: não adicionar dependência sem necessidade). */
async function hashAccessCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createPortal(input: CreatePortalInput): Promise<ActionResult> {
  const parsed = createPortalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const organizationId = await requirePipeOrganization(parsed.data.pipeId);
  const user = await requireOrgRole(organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("portals")
    .insert({
      organization_id: organizationId,
      pipe_id: parsed.data.pipeId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      slug: parsed.data.slug,
      visibility: parsed.data.visibility,
      welcome_message: parsed.data.welcomeMessage ?? null,
      access_code_hash: parsed.data.accessCode ? await hashAccessCode(parsed.data.accessCode) : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Já existe um portal com este identificador (slug)." };
    }
    return { success: false, error: "Não foi possível criar o portal." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/portals`);
  return { success: true, portalId: (data as { id: string }).id };
}

export async function updatePortal(input: UpdatePortalInput): Promise<ActionResult> {
  const parsed = updatePortalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const organizationId = await requirePortalOrganization(parsed.data.portalId);
  await requireOrgRole(organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.welcomeMessage !== undefined) update.welcome_message = parsed.data.welcomeMessage;
  if (parsed.data.visibility !== undefined) update.visibility = parsed.data.visibility;
  if (parsed.data.accessCode !== undefined) {
    update.access_code_hash = parsed.data.accessCode ? await hashAccessCode(parsed.data.accessCode) : null;
  }

  if (Object.keys(update).length === 0) {
    return { success: true, portalId: parsed.data.portalId };
  }

  const { error } = await supabase.from("portals").update(update).eq("id", parsed.data.portalId);
  if (error) {
    return { success: false, error: "Não foi possível atualizar o portal." };
  }

  revalidatePath(`/pipes`);
  return { success: true, portalId: parsed.data.portalId };
}

export async function togglePortal(input: TogglePortalInput): Promise<ActionResult> {
  const parsed = togglePortalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const organizationId = await requirePortalOrganization(parsed.data.portalId);
  await requireOrgRole(organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("portals")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.portalId);

  if (error) {
    return { success: false, error: "Não foi possível alterar o status do portal." };
  }

  revalidatePath(`/pipes`);
  return { success: true, portalId: parsed.data.portalId };
}

/**
 * Substitui a configuração de campos do portal (portal_items) em bloco:
 * remove os que não estão mais na lista e faz upsert dos demais. Não é uma
 * RPC transacional dedicada (diferente de move_card/submit_portal_request)
 * porque aqui não há requisito de atomicidade forte contra falha parcial
 * visível ao usuário externo — é uma tela administrativa; uma falha no meio
 * apenas deixa a configuração parcialmente salva, que o admin pode corrigir
 * reenviando o formulário.
 */
export async function configurePortalItems(input: ConfigurePortalItemsInput): Promise<ActionResult> {
  const parsed = configurePortalItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const organizationId = await requirePortalOrganization(parsed.data.portalId);
  await requireOrgRole(organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("portal_items")
    .delete()
    .eq("portal_id", parsed.data.portalId);
  if (deleteError) {
    return { success: false, error: "Não foi possível atualizar os campos do portal." };
  }

  if (parsed.data.items.length > 0) {
    const { error: insertError } = await supabase.from("portal_items").insert(
      parsed.data.items.map((item) => ({
        portal_id: parsed.data.portalId,
        field_id: item.fieldId,
        position: item.position,
        is_required_override: item.isRequiredOverride ?? null,
      })),
    );
    if (insertError) {
      return { success: false, error: "Não foi possível salvar os campos do portal." };
    }
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/portals`);
  return { success: true, portalId: parsed.data.portalId };
}

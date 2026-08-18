"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE, requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  removeMemberSchema,
  switchOrganizationSchema,
  updateMemberRoleSchema,
  type CreateOrganizationInput,
  type InviteMemberInput,
  type RemoveMemberInput,
  type SwitchOrganizationInput,
  type UpdateMemberRoleInput,
} from "@/lib/validation/organizations";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Onboarding: cria a organização + membership super_admin do criador em
 * transação atômica via RPC `create_organization_with_owner` (evita expor
 * uma policy de INSERT em `organization_memberships` liberada para
 * qualquer usuário, o que permitiria auto-atribuição a organizações
 * alheias).
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<ActionResult> {
  await requireAuth();

  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization_with_owner", {
    org_name: parsed.data.name,
    org_slug: parsed.data.slug,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Já existe uma organização com esse identificador." };
    }
    return { success: false, error: "Não foi possível criar a organização." };
  }

  const newOrgId = (data as { id: string } | null)?.id;
  if (newOrgId) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, newOrgId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect("/dashboard");
}

/**
 * Troca a organização ativa (grava em cookie). Só permite trocar para uma
 * organização da qual o usuário é membro ativo — validado consultando
 * `organization_memberships` sob RLS (se o usuário não for membro, a
 * policy `organization_memberships_select` já retorna zero linhas).
 */
export async function switchOrganization(input: SwitchOrganizationInput): Promise<ActionResult> {
  const user = await requireAuth();

  const parsed = switchOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", parsed.data.organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Você não é membro dessa organização." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, parsed.data.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { success: true };
}

/**
 * Convida um membro para a organização. Requer que o usuário-alvo já
 * possua conta (fluxo de convite por e-mail transacional/token fica para
 * um milestone futuro de colaboração externa — M5). O membership é criado
 * com status `invited`.
 */
export async function inviteMember(input: InviteMemberInput): Promise<ActionResult> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const inviter = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const admin = createAdminClient();
  const { data: invitedUserId, error: lookupError } = await admin.rpc("find_user_id_by_email", {
    lookup_email: parsed.data.email,
  });

  if (lookupError) {
    return { success: false, error: "Não foi possível localizar o usuário." };
  }
  if (!invitedUserId) {
    return {
      success: false,
      error: "Nenhuma conta encontrada com esse e-mail. A pessoa precisa se cadastrar antes.",
    };
  }

  const supabase = await createClient();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("key", parsed.data.roleKey)
    .single();

  if (roleError || !role) {
    return { success: false, error: "Papel inválido." };
  }

  const { error: insertError } = await supabase.from("organization_memberships").insert({
    organization_id: parsed.data.organizationId,
    user_id: invitedUserId as string,
    role_id: (role as { id: string }).id,
    status: "invited",
    invited_by: inviter.id,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: false, error: "Esse usuário já é membro da organização." };
    }
    return { success: false, error: "Não foi possível convidar o usuário." };
  }

  return { success: true };
}

export async function updateMemberRole(input: UpdateMemberRoleInput): Promise<ActionResult> {
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const supabase = await createClient();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("key", parsed.data.roleKey)
    .single();

  if (roleError || !role) {
    return { success: false, error: "Papel inválido." };
  }

  const { error: updateError } = await supabase
    .from("organization_memberships")
    .update({ role_id: (role as { id: string }).id })
    .eq("id", parsed.data.membershipId)
    .eq("organization_id", parsed.data.organizationId);

  if (updateError) {
    return { success: false, error: "Não foi possível atualizar o papel do membro." };
  }

  return { success: true };
}

/**
 * Remove um membro da organização via soft delete (status = 'removed'),
 * preservando histórico (CLAUDE.md §22: não apagar dados históricos quando
 * soft delete é suficiente).
 */
export async function removeMember(input: RemoveMemberInput): Promise<ActionResult> {
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("organization_memberships")
    .update({ status: "removed" })
    .eq("id", parsed.data.membershipId)
    .eq("organization_id", parsed.data.organizationId);

  if (updateError) {
    return { success: false, error: "Não foi possível remover o membro." };
  }

  return { success: true };
}

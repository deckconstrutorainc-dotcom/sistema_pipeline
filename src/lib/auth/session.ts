import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Cookie que guarda a organização ativa selecionada pelo usuário. */
export const ACTIVE_ORG_COOKIE = "bts_active_organization_id";

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  roleKey: string;
}

interface MembershipRow {
  organization_id: string;
  organizations: { id: string; name: string; slug: string } | null;
  roles: { key: string } | null;
}

/**
 * Usuário autenticado atual (ou `null`). Usa `getUser()`, que revalida o
 * token contra o servidor de Auth do Supabase — não confie em
 * `getSession()` em código server-side por ler apenas o cookie local.
 *
 * Envolvida em `React.cache()`: layouts e páginas aninhadas (ex.:
 * `(app)/layout.tsx` + `pipes/[pipeId]/layout.tsx` + `pipes/[pipeId]/
 * page.tsx`) chamam `requireAuth`/`requireActiveOrganization`/`hasOrgRole`
 * várias vezes na mesma requisição — sem essa dedupe, cada chamada disparava
 * uma nova ida à rede ao servidor de Auth do Supabase (medido: até 5-6
 * chamadas redundantes por carregamento de página). `cache()` garante que a
 * chamada de rede acontece só uma vez por requisição, reaproveitada por
 * todos os chamadores — não muda a semântica de segurança (ainda revalida o
 * token a cada NOVA requisição, só não repete dentro da mesma).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
});

/** Garante que há um usuário autenticado; redireciona para /login se não. */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Lista as organizações (memberships ativos) do usuário autenticado,
 * ordenadas por data de entrada. `cache()` pelo mesmo motivo de
 * `getCurrentUser` — evita repetir a consulta a `organization_memberships`
 * quando `getActiveOrganization`/`requireActiveOrganization` são chamadas
 * mais de uma vez na mesma requisição.
 */
export const listUserOrganizations = cache(async (): Promise<ActiveOrganization[]> => {
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations(id, name, slug), roles(key)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as MembershipRow[];
  return rows
    .filter((row) => row.organizations !== null && row.roles !== null)
    .map((row) => ({
      id: row.organizations!.id,
      name: row.organizations!.name,
      slug: row.organizations!.slug,
      roleKey: row.roles!.key,
    }));
});

/**
 * Organização ativa do usuário: respeita o cookie `bts_active_organization_id`
 * quando aponta para uma organização da qual o usuário é membro ativo;
 * caso contrário, cai para a primeira organização do usuário. Retorna
 * `null` quando o usuário não tem nenhuma organização (precisa de
 * onboarding) ou não está autenticado.
 */
export const getActiveOrganization = cache(async (): Promise<ActiveOrganization | null> => {
  const organizations = await listUserOrganizations();
  if (organizations.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  const firstOrganization = organizations[0];
  if (!firstOrganization) {
    // Inalcançável (length > 0 verificado acima), mas satisfaz
    // noUncheckedIndexedAccess sem recorrer a asserção não-nula.
    return null;
  }

  return organizations.find((org) => org.id === activeOrgId) ?? firstOrganization;
});

/**
 * Garante autenticação + organização ativa. Redireciona para /login (sem
 * sessão) ou /onboarding (sem nenhuma organização).
 */
export async function requireActiveOrganization(): Promise<ActiveOrganization> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const org = await getActiveOrganization();
  if (!org) {
    redirect("/onboarding");
  }
  return org;
}

/**
 * Autorização server-side por papel dentro de uma organização. Reaproveita
 * a função SQL `has_org_role`, a mesma fonte de verdade usada pelas
 * policies de RLS — evita divergência entre a checagem de UX e a checagem
 * definitiva no banco.
 *
 * Redireciona para /dashboard quando o usuário não tem o papel exigido.
 * Use a variante que lança (`assertOrgRole`) quando o chamador precisa
 * tratar o caso (ex.: server actions, que não podem simplesmente
 * redirecionar uma mutação em progresso).
 */
export async function requireOrgRole(
  organizationId: string,
  allowedRoleKeys: string[],
): Promise<User> {
  const user = await requireAuth();
  const authorized = await hasOrgRole(organizationId, allowedRoleKeys);
  if (!authorized) {
    redirect("/dashboard");
  }
  return user;
}

/** Mesma checagem de `requireOrgRole`, mas retorna boolean em vez de redirecionar. */
export async function hasOrgRole(
  organizationId: string,
  allowedRoleKeys: string[],
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) {
    return false;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_org_role", {
    target_org_id: organizationId,
    role_keys: allowedRoleKeys,
  });

  if (error) {
    return false;
  }
  return data === true;
}

import { createClient } from "@/lib/supabase/server";

export interface OrganizationMemberOption {
  id: string;
  fullName: string | null;
}

/**
 * Busca `profiles.full_name` para um conjunto de ids de usuário. Helper
 * reutilizado por `listOrganizationMembersForAssignment` (seletor de
 * responsável ao criar card) e pela página de detalhe do card (exibição de
 * nomes de responsáveis) — mesmo padrão já usado em
 * `src/app/(app)/settings/members/page.tsx` e `getPipeBoardData`.
 */
export async function listProfilesByIds(ids: readonly string[]): Promise<OrganizationMemberOption[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", uniqueIds);

  return ((data ?? []) as { id: string; full_name: string | null }[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
  }));
}

/**
 * Lista os membros ativos de uma organização (id + nome), para uso em
 * seletores de responsável (ex.: modal de criação de card). RLS de
 * `organization_memberships`/`profiles` decide o que é visível; não há
 * necessidade de checar papel aqui, qualquer membro pode ver quem mais é
 * membro para fins de atribuição.
 */
export async function listOrganizationMembersForAssignment(
  organizationId: string,
): Promise<OrganizationMemberOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  const userIds = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  return listProfilesByIds(userIds);
}

import { createClient } from "@/lib/supabase/server";

/**
 * Lógica pura (sem I/O) usada tanto pela checagem real quanto pelos testes
 * unitários: dado um mapa em memória de `roleKey -> permissionKeys[]`,
 * resolve se o papel possui a permissão informada.
 */
export function roleHasPermission(
  rolePermissionsByRole: Readonly<Record<string, readonly string[]>>,
  roleKey: string,
  permissionKey: string,
): boolean {
  const permissions = rolePermissionsByRole[roleKey];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permissionKey);
}

interface MembershipRoleRow {
  role_id: string;
}

interface RolePermissionRow {
  permission_id: string;
  permissions: { key: string } | null;
}

/**
 * Verifica se `userId` possui `permissionKey` dentro de `organizationId`,
 * a partir do papel atribuído em `organization_memberships` e do
 * mapeamento `role_permissions`.
 *
 * Roda com o client server-side autenticado como o próprio usuário
 * (respeitando RLS) — não usa service role. Como `roles`/`permissions`/
 * `role_permissions` têm SELECT liberado a qualquer usuário autenticado, a
 * consulta funciona normalmente sob RLS.
 */
export async function hasPermission(
  userId: string,
  organizationId: string,
  permissionKey: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("role_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle<MembershipRoleRow>();

  if (membershipError || !membership) {
    return false;
  }

  const { data: rolePermissions, error: rolePermissionsError } = await supabase
    .from("role_permissions")
    .select("permission_id, permissions(key)")
    .eq("role_id", membership.role_id);

  if (rolePermissionsError || !rolePermissions) {
    return false;
  }

  const rows = rolePermissions as unknown as RolePermissionRow[];
  return rows.some((row) => row.permissions?.key === permissionKey);
}

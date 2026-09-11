import { InviteMemberForm } from "@/components/forms/invite-member-form";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

interface MembershipRow {
  id: string;
  user_id: string;
  status: string;
  roles: { key: string; name: string } | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

export default async function MembersSettingsPage() {
  const organization = await requireActiveOrganization();
  const canManageMembers = await hasOrgRole(organization.id, ["super_admin", "admin"]);

  const supabase = await createClient();
  const { data: membershipsData } = await supabase
    .from("organization_memberships")
    .select("id, user_id, status, roles(key, name)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  const memberships = (membershipsData ?? []) as unknown as MembershipRow[];
  const userIds = memberships.map((m) => m.user_id);

  let profilesById = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    profilesById = new Map(((profilesData ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Membros</h1>
        <p className="text-muted-foreground">
          Membros de <strong>{organization.name}</strong>.
        </p>
      </div>

      {canManageMembers ? <InviteMemberForm organizationId={organization.id} /> : null}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((membership) => {
              const profile = profilesById.get(membership.user_id);
              return (
                <tr key={membership.id} className="border-t">
                  <td className="px-4 py-2">{profile?.full_name ?? "—"}</td>
                  <td className="px-4 py-2">{membership.roles?.name ?? "—"}</td>
                  <td className="px-4 py-2">{membership.status}</td>
                </tr>
              );
            })}
            {memberships.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={3}>
                  Nenhum membro encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

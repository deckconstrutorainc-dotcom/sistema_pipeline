import { requireActiveOrganization } from "@/lib/auth/session";

export default async function DashboardPage() {
  const organization = await requireActiveOrganization();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">
        Organização ativa: <strong>{organization.name}</strong> (papel:{" "}
        {organization.roleKey})
      </p>
      <p className="text-muted-foreground">
        Conteúdo real do dashboard chega no M6 — Gestão e Analytics.
      </p>
    </div>
  );
}

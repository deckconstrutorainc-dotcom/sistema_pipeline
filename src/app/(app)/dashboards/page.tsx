import Link from "next/link";

import { CreateDashboardForm } from "@/components/forms/create-dashboard-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listDashboards } from "@/server/queries/dashboards";

export default async function DashboardsPage() {
  const organization = await requireActiveOrganization();
  const [dashboards, canManageDashboards] = await Promise.all([
    listDashboards(organization.id),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
        <p className="text-muted-foreground">
          Painéis de indicadores de <strong>{organization.name}</strong>, compostos por widgets que
          referenciam reports salvos.
        </p>
      </div>

      {canManageDashboards ? <CreateDashboardForm organizationId={organization.id} /> : null}

      {dashboards.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum dashboard criado ainda.</p>
          {canManageDashboards ? (
            <p className="text-sm">Use o formulário acima para criar o primeiro dashboard.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para criar um dashboard.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Link key={dashboard.id} href={`/dashboards/${dashboard.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle>{dashboard.name}</CardTitle>
                  {dashboard.isDefault ? (
                    <span className="text-xs font-medium text-muted-foreground">Padrão</span>
                  ) : null}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {dashboard.description ?? "Sem descrição."}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

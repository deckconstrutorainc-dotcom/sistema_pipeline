import Link from "next/link";

import { CreateReportForm } from "@/components/forms/create-report-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { reportMetricValues } from "@/lib/validation/reports";
import { listPipes } from "@/server/actions/pipes";
import { listReports } from "@/server/queries/reports";

const metricLabels: Record<(typeof reportMetricValues)[number], string> = {
  phase_counts: "Cards por fase",
  avg_time_in_phase: "Tempo médio por fase",
  completion_rate: "Taxa de conclusão",
  sla_summary: "Resumo de SLA/prazo",
};

export default async function ReportsPage() {
  const organization = await requireActiveOrganization();
  const [reports, canManageReports, pipes] = await Promise.all([
    listReports(organization.id),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
    listPipes(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Relatórios de <strong>{organization.name}</strong> — contagem por fase, tempo médio, taxa de
          conclusão e SLA, calculados a partir dos dados atuais dos pipes.
        </p>
      </div>

      {canManageReports ? (
        <CreateReportForm organizationId={organization.id} pipes={pipes.map((p) => ({ id: p.id, name: p.name }))} />
      ) : null}

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum report criado ainda.</p>
          {canManageReports ? (
            <p className="text-sm">Use o formulário acima para criar o primeiro report.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para criar um report.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle>{report.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>{metricLabels[report.config.metric]}</p>
                  {report.description ? <p className="mt-1">{report.description}</p> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

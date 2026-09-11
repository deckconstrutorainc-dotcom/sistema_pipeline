import Link from "next/link";

import { DeleteReportButton } from "@/components/forms/delete-report-button";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { computeReportResult, getReport } from "@/server/queries/reports";

interface ReportPageProps {
  params: Promise<{ reportId: string }>;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export default async function ReportDetailPage({ params }: ReportPageProps) {
  const { reportId } = await params;
  const organization = await requireActiveOrganization();

  const report = await getReport(reportId);

  if (!report) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Report não encontrado</h1>
        <p className="text-muted-foreground">
          Este report não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href="/reports" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Reports
        </Link>
      </div>
    );
  }

  const [result, canManage] = await Promise.all([
    computeReportResult(report),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  const maxPhaseCount = result.phaseCounts?.reduce((max, p) => Math.max(max, p.count), 0) ?? 0;
  const maxAvgHours = result.avgTimeInPhase?.reduce((max, p) => Math.max(max, p.avgHours ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
            Reports
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{report.name}</h1>
          {report.description ? <p className="text-muted-foreground">{report.description}</p> : null}
        </div>
        {canManage ? <DeleteReportButton reportId={report.id} /> : null}
      </div>

      {result.metric === "phase_counts" && result.phaseCounts ? (
        result.phaseCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fase encontrada no escopo deste report.</p>
        ) : (
          <div className="space-y-3">
            {result.phaseCounts.map((entry) => (
              <div key={entry.phaseId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{entry.phaseName}</span>
                  <span className="text-muted-foreground">{entry.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${maxPhaseCount === 0 ? 0 : (entry.count / maxPhaseCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {result.metric === "avg_time_in_phase" && result.avgTimeInPhase ? (
        result.avgTimeInPhase.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fase encontrada no escopo deste report.</p>
        ) : (
          <div className="space-y-3">
            {result.avgTimeInPhase.map((entry) => (
              <div key={entry.phaseId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{entry.phaseName}</span>
                  <span className="text-muted-foreground">
                    {formatHours(entry.avgHours)} ({entry.sampleSize} amostra(s))
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{
                      width: `${maxAvgHours === 0 ? 0 : ((entry.avgHours ?? 0) / maxAvgHours) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {result.metric === "completion_rate" && result.completionRate ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total de cards</p>
            <p className="text-2xl font-semibold">{result.completionRate.total}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Concluídos</p>
            <p className="text-2xl font-semibold">{result.completionRate.completed}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
            <p className="text-2xl font-semibold">{formatPercent(result.completionRate.rate)}</p>
          </div>
        </div>
      ) : null}

      {result.metric === "sla_summary" && result.slaSummary ? (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total de cards</p>
            <p className="text-2xl font-semibold">{result.slaSummary.total}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Atrasados</p>
            <p className="text-2xl font-semibold text-destructive">{result.slaSummary.overdue}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Vencendo em breve</p>
            <p className="text-2xl font-semibold">{result.slaSummary.dueSoon}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">SLA excedido</p>
            <p className="text-2xl font-semibold text-destructive">{result.slaSummary.slaExceeded}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

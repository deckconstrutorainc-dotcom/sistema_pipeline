import Link from "next/link";

import { AddWidgetForm } from "@/components/forms/add-widget-form";
import { RemoveWidgetButton } from "@/components/forms/remove-widget-button";
import { SetDefaultDashboardButton } from "@/components/forms/set-default-dashboard-button";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { getDashboardDetail, type DashboardWidgetSummary } from "@/server/queries/dashboards";
import { computeReportResult, listReports, type ReportResult } from "@/server/queries/reports";

interface DashboardPageProps {
  params: Promise<{ dashboardId: string }>;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function WidgetBody({ result }: { widget: DashboardWidgetSummary; result: ReportResult | null }) {
  if (!result) {
    return <p className="text-sm text-muted-foreground">Sem report vinculado.</p>;
  }

  if (result.metric === "phase_counts" && result.phaseCounts) {
    return (
      <ul className="space-y-1 text-sm">
        {result.phaseCounts.map((entry) => (
          <li key={entry.phaseId} className="flex items-center justify-between">
            <span>{entry.phaseName}</span>
            <span className="text-muted-foreground">{entry.count}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (result.metric === "completion_rate" && result.completionRate) {
    return (
      <p className="text-3xl font-semibold">
        {formatPercent(result.completionRate.rate)}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({result.completionRate.completed}/{result.completionRate.total})
        </span>
      </p>
    );
  }

  if (result.metric === "sla_summary" && result.slaSummary) {
    return (
      <div className="grid grid-cols-2 gap-2 text-sm">
        <p>
          Atrasados: <strong className="text-destructive">{result.slaSummary.overdue}</strong>
        </p>
        <p>
          SLA excedido: <strong className="text-destructive">{result.slaSummary.slaExceeded}</strong>
        </p>
      </div>
    );
  }

  if (result.metric === "avg_time_in_phase" && result.avgTimeInPhase) {
    return (
      <ul className="space-y-1 text-sm">
        {result.avgTimeInPhase.map((entry) => (
          <li key={entry.phaseId} className="flex items-center justify-between">
            <span>{entry.phaseName}</span>
            <span className="text-muted-foreground">
              {entry.avgHours === null ? "—" : `${entry.avgHours.toFixed(1)} h`}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

export default async function DashboardDetailPage({ params }: DashboardPageProps) {
  const { dashboardId } = await params;
  const organization = await requireActiveOrganization();

  const detail = await getDashboardDetail(dashboardId);

  if (!detail) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard não encontrado</h1>
        <p className="text-muted-foreground">
          Este dashboard não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href="/dashboards" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Dashboards
        </Link>
      </div>
    );
  }

  const [canManage, reports] = await Promise.all([
    hasOrgRole(organization.id, ["super_admin", "admin"]),
    listReports(organization.id),
  ]);

  const widgetResults = await Promise.all(
    detail.widgets.map(async (widget) => {
      if (!widget.reportId) return null;
      const report = reports.find((r) => r.id === widget.reportId);
      if (!report) return null;
      return computeReportResult(report);
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboards" className="text-sm text-muted-foreground hover:underline">
            Dashboards
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.dashboard.name}</h1>
          {detail.dashboard.description ? (
            <p className="text-muted-foreground">{detail.dashboard.description}</p>
          ) : null}
        </div>
        {canManage ? (
          <SetDefaultDashboardButton
            organizationId={organization.id}
            dashboardId={detail.dashboard.id}
            isDefault={detail.dashboard.isDefault}
          />
        ) : null}
      </div>

      {canManage ? <AddWidgetForm dashboardId={detail.dashboard.id} reports={reports} /> : null}

      {detail.widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum widget neste dashboard ainda.</p>
          {canManage ? (
            <p className="text-sm">Use o formulário acima para adicionar o primeiro widget.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para configurar este dashboard.</p>
          )}
        </div>
      ) : (
        // Grid simples por número de colunas (12) — sem drag-and-drop nesta fase
        // (TODO M6+: reordenar/redimensionar widgets visualmente com dnd-kit).
        <div className="grid grid-cols-12 gap-4">
          {detail.widgets.map((widget, index) => (
            <div
              key={widget.id}
              className="space-y-2 rounded-lg border p-4"
              style={{ gridColumn: `span ${Math.min(widget.width, 12)} / span ${Math.min(widget.width, 12)}` }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{widget.title}</h2>
                {canManage ? (
                  <RemoveWidgetButton dashboardId={detail.dashboard.id} widgetId={widget.id} />
                ) : null}
              </div>
              <WidgetBody widget={widget} result={widgetResults[index] ?? null} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

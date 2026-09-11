import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveOrganization } from "@/lib/auth/session";
import { reportMetricLabels } from "@/lib/validation/reports";
import { getPipeBoardData } from "@/server/queries/pipes";
import { listReports } from "@/server/queries/reports";

interface PipeReportsPageProps {
  params: Promise<{ pipeId: string }>;
}

/**
 * Aba "Relatórios" de um pipe: lista os reports da organização já
 * escopados a este pipe (`reports.pipe_id`). Reaproveita `listReports`
 * (agora com filtro opcional por `pipeId`) e `reportMetricLabels` de
 * `src/server/queries/reports.ts` / `src/lib/validation/reports.ts` — não
 * duplica cálculo de report. A criação de novos reports (com seletor de
 * pipe) continua em `/reports`, para não duplicar o formulário aqui.
 */
export default async function PipeReportsPage({ params }: PipeReportsPageProps) {
  const { pipeId } = await params;
  const organization = await requireActiveOrganization();

  const board = await getPipeBoardData(pipeId);
  if (!board) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pipe não encontrado</h1>
        <p className="text-muted-foreground">
          Este pipe não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href="/pipes" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Pipes
        </Link>
      </div>
    );
  }

  const reports = await listReports(organization.id, pipeId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios — {board.pipe.name}</h1>
        <p className="text-muted-foreground">
          Reports escopados a este pipe. Para criar um novo report, use{" "}
          <Link href="/reports" className="text-primary underline-offset-4 hover:underline">
            a página de Reports
          </Link>{" "}
          e selecione este pipe.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum report escopado a este pipe ainda.</p>
          <p className="text-sm">
            Crie um em{" "}
            <Link href="/reports" className="text-primary underline-offset-4 hover:underline">
              Reports
            </Link>
            .
          </p>
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
                  <p>{reportMetricLabels[report.config.metric]}</p>
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

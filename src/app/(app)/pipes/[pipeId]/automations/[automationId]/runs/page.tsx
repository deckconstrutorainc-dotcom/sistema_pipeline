import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireActiveOrganization } from "@/lib/auth/session";
import { listAutomationRuns, listAutomations } from "@/server/actions/automations";

interface AutomationRunsPageProps {
  params: Promise<{ pipeId: string; automationId: string }>;
}

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  pending: "outline",
  running: "warning",
  succeeded: "success",
  failed: "destructive",
  skipped: "secondary",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  running: "Em execução",
  succeeded: "Concluída com sucesso",
  failed: "Falhou",
  skipped: "Pulada (condição não atendida ou inativa)",
};

export default async function AutomationRunsPage({ params }: AutomationRunsPageProps) {
  const { pipeId, automationId } = await params;
  await requireActiveOrganization();

  // A policy automations_select (RLS, is_pipe_member) já garante que a
  // lista só traz automações visíveis ao usuário; buscamos aqui apenas
  // para exibir o nome/estado no cabeçalho da página.
  const automations = await listAutomations(pipeId);
  const automation = automations.find((a) => a.id === automationId);

  if (!automation) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Automação não encontrada</h1>
        <p className="text-muted-foreground">
          Esta automação não existe ou você não tem permissão para vê-la.
        </p>
        <Link
          href={`/pipes/${pipeId}/automations`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Voltar para Automações
        </Link>
      </div>
    );
  }

  // listAutomationRuns() é adicionalmente protegida por
  // automation_runs_select (RLS, can_manage_pipe_structure) — quem só é
  // membro do pipe mas não gerencia sua estrutura vê a automação, mas não
  // o histórico de execuções (dados operacionais internos).
  const runs = await listAutomationRuns(automationId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/pipes/${pipeId}/automations`} className="text-sm text-muted-foreground hover:underline">
          Automações
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico — {automation.name}</h1>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma execução registrada ainda. Uma run é criada assim que o evento configurado
          ({automation.triggerEvent}) acontece, e processada por{" "}
          <code className="rounded bg-muted px-1">/api/automations/process</code>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Status</th>
                <th className="p-3">Tentativa</th>
                <th className="p-3">Erro</th>
                <th className="p-3">Criada em</th>
                <th className="p-3">Finalizada em</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Badge variant={statusVariant[run.status] ?? "outline"}>
                      {statusLabels[run.status] ?? run.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {run.attempt}/{run.maxAttempts}
                  </td>
                  <td className="p-3 max-w-xs truncate text-destructive">{run.errorMessage ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {run.finishedAt ? new Date(run.finishedAt).toLocaleString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

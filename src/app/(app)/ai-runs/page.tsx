import { ApproveAiRunButtons } from "@/components/forms/approve-ai-run-buttons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveOrganization } from "@/lib/auth/session";
import { listAiRuns } from "@/server/actions/ai-runs";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  pending: "outline",
  running: "secondary",
  awaiting_approval: "warning",
  approved: "secondary",
  rejected: "destructive",
  succeeded: "success",
  failed: "destructive",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  running: "Executando",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  succeeded: "Concluída",
  failed: "Falhou",
};

/**
 * Histórico de execuções de IA (CLAUDE.md §18 auditoria) — qualquer membro
 * da organização pode ver o que a IA fez (RLS `ai_runs_select`); somente
 * runs em `awaiting_approval` mostram os botões de aprovar/rejeitar
 * (a própria RPC `approve_ai_run` também reforça que só admin/super_admin
 * consegue de fato aprovar — os botões aparecem para todos, mas a ação
 * falha com uma mensagem clara para quem não tem permissão).
 */
export default async function AiRunsPage() {
  const organization = await requireActiveOrganization();
  const runs = await listAiRuns(organization.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Execuções de IA</h1>
        <p className="text-muted-foreground">
          Histórico completo de execuções, tool calls (auditoria) e uso/custo estimado de cada chamada de IA.
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma execução de IA registrada ainda. Dispare uma pela página de um card ou pelos agentes configurados
          em Settings → Agentes de IA.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">{run.aiAgentName}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant[run.status] ?? "outline"}>
                      {statusLabels[run.status] ?? run.status}
                    </Badge>
                    <Badge variant="outline">{run.triggerType}</Badge>
                    {run.model ? <Badge variant="outline">{run.model}</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString("pt-BR")}
                    {run.tokensUsed !== null ? ` · ${run.tokensUsed} tokens` : ""}
                    {run.costUsd !== null ? ` · US$ ${run.costUsd.toFixed(4)}` : ""}
                  </p>
                </div>
                {run.status === "awaiting_approval" ? <ApproveAiRunButtons runId={run.id} /> : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {typeof run.input["instruction"] === "string" ? (
                  <p className="text-sm">
                    <span className="font-medium">Instrução: </span>
                    {run.input["instruction"] as string}
                  </p>
                ) : null}

                {run.output && typeof run.output["content"] === "string" && run.output["content"] ? (
                  <p className="text-sm">
                    <span className="font-medium">Resposta: </span>
                    {run.output["content"] as string}
                  </p>
                ) : null}

                {run.errorMessage ? <p className="text-sm text-destructive">{run.errorMessage}</p> : null}

                {run.toolCalls.length > 0 ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      Tool calls ({run.toolCalls.length}) — auditoria
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {run.toolCalls.map((call, index) => (
                        <li key={`${call.id}-${index}`} className="rounded-md bg-muted/50 p-2 text-xs">
                          <p>
                            <span className="font-medium">{call.name}</span> — {call.status}
                          </p>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(call.input)}
                          </pre>
                          {call.error ? <p className="mt-1 text-destructive">{call.error}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

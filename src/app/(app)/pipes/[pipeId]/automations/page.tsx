import Link from "next/link";

import { CreateAutomationForm } from "@/components/forms/create-automation-form";
import { ToggleAutomationButton } from "@/components/forms/toggle-automation-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveOrganization } from "@/lib/auth/session";
import { listAutomations } from "@/server/actions/automations";
import { createClient } from "@/lib/supabase/server";

interface AutomationsPageProps {
  params: Promise<{ pipeId: string }>;
}

const triggerEventLabels: Record<string, string> = {
  "card.created": "Card criado",
  "card.moved": "Card movido de fase",
  "card.field.updated": "Campo do card atualizado",
  "card.overdue": "Card atrasado (prazo vencido)",
  "phase.sla.exceeded": "SLA da fase excedido",
};

export default async function AutomationsPage({ params }: AutomationsPageProps) {
  const { pipeId } = await params;
  await requireActiveOrganization();

  // RLS decide se o pipe é visível (is_pipe_member) — mesma postura de
  // getPipeBoardData: não distinguimos "não existe" de "sem permissão".
  const supabase = await createClient();
  const { data: pipe } = await supabase
    .from("pipes")
    .select("id, name")
    .eq("id", pipeId)
    .maybeSingle<{ id: string; name: string }>();

  if (!pipe) {
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

  const automations = await listAutomations(pipeId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/pipes/${pipeId}`} className="text-sm text-muted-foreground hover:underline">
          {pipe.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Automações</h1>
        <p className="text-muted-foreground">
          Evento → Condições → Ações. Toda execução fica registrada com status, tentativas e erro (ver
          histórico de cada automação).
        </p>
      </div>

      <CreateAutomationForm pipeId={pipeId} />

      {automations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma automação configurada para este pipe ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <Card key={automation.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle>{automation.name}</CardTitle>
                  {automation.description ? (
                    <p className="text-sm text-muted-foreground">{automation.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {triggerEventLabels[automation.triggerEvent] ?? automation.triggerEvent}
                    </Badge>
                    <Badge variant={automation.isActive ? "success" : "outline"}>
                      {automation.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </div>
                <ToggleAutomationButton
                  automationId={automation.id}
                  pipeId={pipeId}
                  isActive={automation.isActive}
                />
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {automation.conditions.length} condição(ões) · {automation.actions.length} ação(ões)
                </p>
                <Link
                  href={`/pipes/${pipeId}/automations/${automation.id}/runs`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver histórico de execuções
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

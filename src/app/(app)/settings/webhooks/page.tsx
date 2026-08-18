import Link from "next/link";

import { CreateWebhookForm } from "@/components/forms/create-webhook-form";
import { ToggleWebhookButton } from "@/components/forms/toggle-webhook-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listWebhooks } from "@/server/actions/webhooks";

const eventTypeLabels: Record<string, string> = {
  "card.created": "Card criado",
  "card.moved": "Card movido de fase",
  "card.field.updated": "Campo do card atualizado",
  "card.overdue": "Card atrasado (prazo vencido)",
  "phase.sla.exceeded": "SLA da fase excedido",
};

/** Página de webhooks (CLAUDE.md §16, M7). Estados: forbidden/empty/success. */
export default async function WebhooksSettingsPage() {
  const organization = await requireActiveOrganization();
  const canManage = await hasOrgRole(organization.id, ["super_admin", "admin"]);

  if (!canManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-muted-foreground">Você não tem permissão para gerenciar webhooks desta organização.</p>
      </div>
    );
  }

  const webhooks = await listWebhooks(organization.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-muted-foreground">
          Entregas outbound (BTS Pipe → sistema externo) e recebimento inbound (sistema externo → BTS Pipe) de
          eventos de domínio, com log de entregas e retries.
        </p>
      </div>

      <CreateWebhookForm organizationId={organization.id} />

      {webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhum webhook configurado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle>
                    {webhook.direction === "outbound" ? webhook.url : `/api/webhooks/inbound/${webhook.id}`}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{webhook.direction === "outbound" ? "Outbound" : "Inbound"}</Badge>
                    <Badge variant={webhook.isActive ? "success" : "outline"}>
                      {webhook.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    <Badge variant={webhook.hasSecret ? "success" : "warning"}>
                      {webhook.hasSecret ? "Assinatura HMAC configurada" : "Sem assinatura"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {webhook.eventTypes.map((e) => eventTypeLabels[e] ?? e).join(", ")}
                  </p>
                </div>
                <ToggleWebhookButton
                  webhookId={webhook.id}
                  organizationId={organization.id}
                  isActive={webhook.isActive}
                />
              </CardHeader>
              <CardContent>
                <Link
                  href={`/settings/webhooks/${webhook.id}/deliveries`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver log de entregas
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

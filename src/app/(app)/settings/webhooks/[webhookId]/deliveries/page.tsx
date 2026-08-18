import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listWebhookDeliveries, listWebhooks } from "@/server/actions/webhooks";

interface WebhookDeliveriesPageProps {
  params: Promise<{ webhookId: string }>;
}

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  pending: "outline",
  delivered: "success",
  failed: "destructive",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente / aguardando retry",
  delivered: "Entregue",
  failed: "Falhou (tentativas esgotadas)",
};

/** Log de entregas/recebimentos de um webhook (CLAUDE.md §11/§18 — observabilidade e auditoria). */
export default async function WebhookDeliveriesPage({ params }: WebhookDeliveriesPageProps) {
  const { webhookId } = await params;
  const organization = await requireActiveOrganization();
  const canManage = await hasOrgRole(organization.id, ["super_admin", "admin"]);

  if (!canManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Log de entregas</h1>
        <p className="text-muted-foreground">Você não tem permissão para ver o log de entregas deste webhook.</p>
      </div>
    );
  }

  // A policy webhook_deliveries_select (RLS) já restringe a leitura a
  // admin/super_admin da organização dona do webhook — buscamos a lista de
  // webhooks só para exibir a URL/direção no cabeçalho.
  const webhooks = await listWebhooks(organization.id);
  const webhook = webhooks.find((w) => w.id === webhookId);

  if (!webhook) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Webhook não encontrado</h1>
        <p className="text-muted-foreground">Este webhook não existe ou você não tem permissão para vê-lo.</p>
        <Link href="/settings/webhooks" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Webhooks
        </Link>
      </div>
    );
  }

  const deliveries = await listWebhookDeliveries(webhookId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/settings/webhooks" className="text-sm text-muted-foreground hover:underline">
          Webhooks
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Log de entregas — {webhook.direction === "outbound" ? webhook.url : `/api/webhooks/inbound/${webhook.id}`}
        </h1>
      </div>

      {deliveries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma entrega registrada ainda.{" "}
          {webhook.direction === "outbound"
            ? "Uma entrega é criada assim que um evento assinado por este webhook acontece, e processada por /api/automations/process."
            : "Entregas aparecem aqui quando o sistema externo chamar a URL de recebimento."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Status</th>
                <th className="p-3">HTTP</th>
                <th className="p-3">Tentativa</th>
                <th className="p-3">Erro</th>
                <th className="p-3">Criada em</th>
                <th className="p-3">Entregue em</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Badge variant={statusVariant[delivery.status] ?? "outline"}>
                      {statusLabels[delivery.status] ?? delivery.status}
                    </Badge>
                  </td>
                  <td className="p-3">{delivery.httpStatus ?? "—"}</td>
                  <td className="p-3">
                    {delivery.attempt}/{delivery.maxAttempts}
                  </td>
                  <td className="p-3 max-w-xs truncate text-destructive">{delivery.errorMessage ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(delivery.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString("pt-BR") : "—"}
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

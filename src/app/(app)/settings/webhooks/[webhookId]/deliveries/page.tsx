import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="p-3">Status</TableHead>
                <TableHead className="p-3">HTTP</TableHead>
                <TableHead className="p-3">Tentativa</TableHead>
                <TableHead className="p-3">Erro</TableHead>
                <TableHead className="p-3">Criada em</TableHead>
                <TableHead className="p-3">Entregue em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery) => (
                <TableRow key={delivery.id} className="border-b last:border-0">
                  <TableCell className="p-3">
                    <Badge variant={statusVariant[delivery.status] ?? "outline"}>
                      {statusLabels[delivery.status] ?? delivery.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3">{delivery.httpStatus ?? "—"}</TableCell>
                  <TableCell className="p-3">
                    {delivery.attempt}/{delivery.maxAttempts}
                  </TableCell>
                  <TableCell className="p-3 max-w-xs truncate text-destructive">{delivery.errorMessage ?? "—"}</TableCell>
                  <TableCell className="p-3 text-muted-foreground">
                    {new Date(delivery.createdAt).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="p-3 text-muted-foreground">
                    {delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString("pt-BR") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      )}
    </div>
  );
}

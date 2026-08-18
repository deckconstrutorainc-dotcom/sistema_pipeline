import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto/secret-encryption";
import { deliverHttpWebhook } from "@/lib/integrations/http-webhook-provider";

/**
 * Processamento server-side de uma `webhook_deliveries` outbound (M7,
 * CLAUDE.md §16/§11 — mesmo papel de `processAutomationRun`,
 * `automation-processor.ts`, M3, cujo padrão de idempotência/retry este
 * arquivo reaproveita deliberadamente em vez de duplicar).
 *
 * Roda EXCLUSIVAMENTE com o client admin (`SUPABASE_SERVICE_ROLE_KEY`,
 * server-only), chamado apenas por `POST /api/automations/process`
 * (protegido por `CRON_SECRET` — ver comentário naquele arquivo). Nunca é
 * exposto como server action chamável diretamente pelo client autenticado.
 *
 * Idempotência: se a delivery já está 'delivered', retorna sem reenviar —
 * reprocessar uma delivery finalizada nunca duplica o POST externo.
 *
 * Retries: mesmo padrão de `failRun`/`automation-processor.ts` — em caso
 * de falha (rede, timeout, HTTP não-2xx), se `attempt < max_attempts`, a
 * delivery permanece 'pending' com `attempt` incrementado, para ser pega
 * de novo em um próximo lote de `/api/automations/process`. Ao esgotar as
 * tentativas, marca 'failed' definitivamente.
 */

interface WebhookRow {
  id: string;
  url: string | null;
  secret_ciphertext: string | null;
  is_active: boolean;
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  payload: Record<string, unknown>;
  attempt: number;
  max_attempts: number;
  status: "pending" | "delivered" | "failed";
  webhooks: WebhookRow | null;
}

export interface ProcessDeliveryResult {
  deliveryId: string;
  status: "delivered" | "failed" | "pending";
  error?: string;
}

export async function processWebhookDelivery(deliveryId: string): Promise<ProcessDeliveryResult> {
  const admin = createAdminClient();

  const { data: delivery, error: deliveryError } = await admin
    .from("webhook_deliveries")
    .select("id, webhook_id, payload, attempt, max_attempts, status, webhooks(id, url, secret_ciphertext, is_active)")
    .eq("id", deliveryId)
    .maybeSingle<DeliveryRow>();

  if (deliveryError || !delivery) {
    return { deliveryId, status: "failed", error: "webhook_delivery não encontrada." };
  }

  // Idempotência: reprocessar uma delivery já finalizada não reenvia.
  if (delivery.status === "delivered") {
    return { deliveryId, status: "delivered" };
  }

  const webhook = delivery.webhooks;
  if (!webhook) {
    await admin
      .from("webhook_deliveries")
      .update({ status: "failed", error_message: "Webhook de origem não encontrado (pode ter sido removido)." })
      .eq("id", deliveryId);
    return { deliveryId, status: "failed", error: "Webhook de origem não encontrado." };
  }

  if (!webhook.is_active) {
    await admin
      .from("webhook_deliveries")
      .update({ status: "failed", error_message: "Webhook está desativado." })
      .eq("id", deliveryId);
    return { deliveryId, status: "failed", error: "Webhook está desativado." };
  }

  if (!webhook.url) {
    await admin
      .from("webhook_deliveries")
      .update({ status: "failed", error_message: "Webhook sem URL de destino configurada." })
      .eq("id", deliveryId);
    return { deliveryId, status: "failed", error: "Webhook sem URL de destino configurada." };
  }

  let secret: string | null = null;
  if (webhook.secret_ciphertext) {
    try {
      secret = decryptSecret(webhook.secret_ciphertext);
    } catch {
      // Nunca inclui o ciphertext nem detalhe do segredo em error_message
      // (CLAUDE.md §3.10 — não logar segredo, nem em claro nem parcial).
      await admin
        .from("webhook_deliveries")
        .update({ status: "failed", error_message: "Falha ao decriptar o segredo do webhook (chave de criptografia incorreta ou dado corrompido)." })
        .eq("id", deliveryId);
      return { deliveryId, status: "failed", error: "Falha ao decriptar o segredo do webhook." };
    }
  }

  const result = await deliverHttpWebhook({ url: webhook.url, payload: delivery.payload, secret });

  if (result.success) {
    await admin
      .from("webhook_deliveries")
      .update({
        status: "delivered",
        http_status: result.httpStatus,
        response_body: result.responseBody,
        error_message: null,
        delivered_at: new Date().toISOString(),
      })
      .eq("id", deliveryId);
    return { deliveryId, status: "delivered" };
  }

  return failDelivery(admin, delivery, result.httpStatus, result.responseBody, result.error ?? "Falha desconhecida na entrega.");
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Marca a delivery como falha, incrementando `attempt` e mantendo
 * 'pending' se ainda houver tentativas disponíveis (retry — quem decide
 * QUANDO reprocessar é o worker externo via `/api/automations/process`,
 * mesmo racional de `failRun` em `automation-processor.ts`), ou 'failed'
 * definitivo ao esgotar `max_attempts`.
 */
async function failDelivery(
  admin: AdminClient,
  delivery: DeliveryRow,
  httpStatus: number | null,
  responseBody: string | null,
  message: string,
): Promise<ProcessDeliveryResult> {
  const nextAttempt = delivery.attempt + 1;
  const exhausted = nextAttempt > delivery.max_attempts;

  await admin
    .from("webhook_deliveries")
    .update({
      status: exhausted ? "failed" : "pending",
      attempt: nextAttempt,
      http_status: httpStatus,
      response_body: responseBody,
      error_message: message,
    })
    .eq("id", delivery.id);

  return { deliveryId: delivery.id, status: exhausted ? "failed" : "pending", error: message };
}

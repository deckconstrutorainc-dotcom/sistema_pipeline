/**
 * Assinatura HMAC-SHA256 de payload de webhook (CLAUDE.md §16 — "validação
 * de webhook" no PROMPT_MESTRE M7). Usada tanto para assinar entregas
 * outbound (`webhook-dispatcher.ts`) quanto para validar chamadas inbound
 * (`src/app/api/webhooks/inbound/[webhookId]/route.ts`).
 *
 * Função pura (sem I/O) — testável sem banco/rede
 * (`tests/unit/webhook-signature.test.ts`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Nome do header HTTP usado para transportar a assinatura. */
export const WEBHOOK_SIGNATURE_HEADER = "x-bts-signature";

/**
 * Assina um payload (string, tipicamente `JSON.stringify(body)`) com o
 * segredo do webhook. Retorna a assinatura em hex, prefixada com o
 * algoritmo (`sha256=...`) — mesmo formato usado por provedores conhecidos
 * (ex.: GitHub), facilita reconhecimento por quem consome o webhook.
 */
export function signWebhookPayload(secret: string, payload: string): string {
  const digest = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `sha256=${digest}`;
}

/**
 * Valida uma assinatura recebida contra o payload bruto e o segredo
 * esperado. Comparação em tempo constante (evita timing attack). Retorna
 * `false` para qualquer entrada malformada — nunca lança.
 */
export function verifyWebhookSignature(secret: string, payload: string, receivedSignature: string | null): boolean {
  if (!receivedSignature) {
    return false;
  }

  const expected = signWebhookPayload(secret, payload);

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(receivedSignature, "utf8");
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, receivedBuf);
}

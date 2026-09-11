/**
 * Adapter funcional real para o provider `http_webhook` (CLAUDE.md §16).
 * Diferente dos adapters de Google/Microsoft/assinatura eletrônica, este
 * NÃO depende de credenciais externas reais — é só uma chamada HTTP
 * assinada, então é implementado de ponta a ponta (não é stub).
 *
 * Reaproveitado por `webhook-dispatcher.ts` (que trata retry/status na
 * tabela `webhook_deliveries`) — este módulo só sabe fazer UMA tentativa
 * de entrega assinada; não decide sobre retry.
 */
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from "@/lib/integrations/webhook-signature";
import type { IntegrationCallResult, IntegrationProvider } from "@/lib/integrations/types";

const DELIVERY_TIMEOUT_MS = 10_000;

export interface HttpWebhookDeliveryInput {
  url: string;
  payload: Record<string, unknown>;
  /** Segredo já decriptado (nunca logado) — pode ser `null` para webhook sem assinatura configurada. */
  secret: string | null;
}

export interface HttpWebhookDeliveryResult extends IntegrationCallResult {
  httpStatus: number | null;
  responseBody: string | null;
}

/**
 * Executa UMA tentativa de POST HTTP com o payload assinado (se houver
 * segredo). Nunca lança para erros de rede/timeout — sempre retorna um
 * resultado, para que o chamador (dispatcher) decida sobre retry sem
 * precisar de try/catch espalhado.
 */
export async function deliverHttpWebhook(input: HttpWebhookDeliveryInput): Promise<HttpWebhookDeliveryResult> {
  const body = JSON.stringify(input.payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.secret) {
    headers[WEBHOOK_SIGNATURE_HEADER] = signWebhookPayload(input.secret, body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    const responseBody = await response.text().catch(() => null);
    const truncatedBody = responseBody && responseBody.length > 2000 ? responseBody.slice(0, 2000) : responseBody;

    return {
      success: response.ok,
      httpStatus: response.status,
      responseBody: truncatedBody,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timeout após ${DELIVERY_TIMEOUT_MS}ms`
          : err.message
        : "Erro de rede desconhecido.";
    return { success: false, httpStatus: null, responseBody: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export class HttpWebhookProvider implements IntegrationProvider {
  readonly providerKey = "http_webhook" as const;

  async execute(input: Record<string, unknown>): Promise<IntegrationCallResult> {
    const url = input["url"];
    const payload = (input["payload"] as Record<string, unknown>) ?? {};
    const secret = typeof input["secret"] === "string" ? (input["secret"] as string) : null;

    if (typeof url !== "string") {
      return { success: false, error: "URL de destino não configurada." };
    }

    const result = await deliverHttpWebhook({ url, payload, secret });
    return { success: result.success, error: result.error };
  }
}

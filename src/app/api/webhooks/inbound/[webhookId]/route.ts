import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto/secret-encryption";
import { verifyWebhookSignature, WEBHOOK_SIGNATURE_HEADER } from "@/lib/integrations/webhook-signature";

export const dynamic = "force-dynamic";

/**
 * `POST /api/webhooks/inbound/[webhookId]`: ponto de recebimento de
 * chamadas externas (CLAUDE.md §16, M7 — "validação de webhook").
 *
 * Rota PÚBLICA (sem sessão de usuário — quem chama é um sistema externo),
 * mas usa o client ADMIN (service role) deliberadamente: é a única forma
 * de ler `webhooks.secret_ciphertext` (bloqueado para `authenticated`/
 * `anon` via RLS + GRANT de coluna — ver
 * `20260818094700_ecosystem_rls_policies.sql`) e de escrever em
 * `webhook_deliveries` (sem policy de INSERT para client). Mesmo padrão
 * já usado por `/api/automations/process` (M3): route handler server-side
 * usando o client admin não viola CLAUDE.md §10 — a violação seria expor a
 * `SUPABASE_SERVICE_ROLE_KEY` ao NAVEGADOR, o que não acontece aqui (a
 * chave nunca sai do processo Node do servidor).
 *
 * Validação de assinatura: se o webhook tiver `secret_ciphertext`
 * configurado, a chamada PRECISA trazer o header `x-bts-signature` válido
 * (HMAC-SHA256 do corpo bruto, mesmo esquema de `webhook-signature.ts`
 * usado nas entregas outbound). Assinatura ausente/inválida -> 401, SEM
 * detalhar o motivo no corpo da resposta (evita ajudar um atacante a
 * descobrir se o segredo está certo por tentativa e erro). Se o webhook
 * não tiver segredo configurado, a chamada é aceita sem validação de
 * assinatura (webhook "aberto" — decisão explícita de quem o configurou).
 *
 * TODO (documentado, fora do escopo deste milestone): esta rota registra a
 * entrega em `webhook_deliveries` mas NÃO emite um `domain_event`
 * `webhook.received` para que automações reajam — ampliaria o escopo do
 * event_type check constraint (M3) e a validação/roteamento de qual pipe
 * deveria reagir a um evento externo genérico, que não tem um `pipe_id`
 * natural (o webhook pode ser escopado à organização inteira). Fica como
 * extensão futura natural quando houver um caso de uso concreto guiando o
 * design (ex.: qual automação deveria disparar, e com qual card/entidade
 * associada).
 */
export async function POST(request: Request, context: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await context.params;

  const rawBody = await request.text().catch(() => "");

  const admin = createAdminClient();
  const { data: webhook } = await admin
    .from("webhooks")
    .select("id, direction, is_active, secret_ciphertext")
    .eq("id", webhookId)
    .maybeSingle<{ id: string; direction: string; is_active: boolean; secret_ciphertext: string | null }>();

  // Resposta uniforme para "não existe"/"não é inbound"/"inativo" — não
  // vaza qual das três condições falhou (mesma postura de segurança de
  // "não distinguir não existe de sem permissão" já usada em outros
  // pontos públicos do M5).
  if (!webhook || webhook.direction !== "inbound" || !webhook.is_active) {
    return NextResponse.json({ error: "Webhook não encontrado." }, { status: 404 });
  }

  if (webhook.secret_ciphertext) {
    let secret: string;
    try {
      secret = decryptSecret(webhook.secret_ciphertext);
    } catch {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);
    if (!verifyWebhookSignature(secret, rawBody, signature)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  // idempotency_key própria para inbound: sem um identificador de chamada
  // do provedor externo garantido, usa timestamp + random — evita colisão
  // sem depender de o provedor externo fornecer um id de evento.
  const idempotencyKey = `inbound:${Date.now()}:${randomUUID()}`;

  const { error: insertError } = await admin.from("webhook_deliveries").insert({
    webhook_id: webhook.id,
    direction: "inbound",
    payload,
    status: "delivered",
    delivered_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
  });

  if (insertError) {
    return NextResponse.json({ error: "Não foi possível registrar o recebimento." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

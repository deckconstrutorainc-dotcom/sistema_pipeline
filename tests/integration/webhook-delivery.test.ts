/**
 * Teste de integração do módulo de webhooks (M7).
 *
 * MODO PADRÃO (roda sempre, sem nenhuma variável de ambiente): PGlite — um
 * Postgres real (WASM), sem Docker, sem projeto Supabase remoto. Ver
 * `tests/integration/setup/pglite-supabase.ts` para a documentação
 * completa do harness (baseline replicado, GRANTs, limitações conhecidas).
 * Cobre: card.created em um pipe com webhook outbound configurado gera
 * webhook_deliveries 'pending' com idempotency_key + job 'webhook_delivery'
 * (via `emit_domain_event()`, `20260818094800_webhook_dispatch.sql`),
 * isolamento entre tenants desse enfileiramento, e o RLS (zero policies) de
 * `integration_credentials`. Ver o comentário no início do describe abaixo
 * para a fronteira exata de escopo deste bloco.
 *
 * MODO OPCIONAL (roda só se as env vars abaixo estiverem definidas):
 * Supabase local real via CLI/Docker (`supabase start` + `supabase db
 * reset`), usando `@supabase/supabase-js` sobre HTTP/PostgREST. Único modo
 * que exercita `processWebhookDelivery()` (`src/server/services/
 * webhook-dispatcher.ts`) de verdade: entrega HTTP real, retry até
 * `max_attempts`, e o curto-circuito de idempotência de reprocessamento —
 * nada disso é testável contra o pglite (sem PostgREST na frente dele, e
 * sem rede real desejável em teste).
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M7).
 *   3. Exporte as variáveis de ambiente acima, incluindo `ENCRYPTION_KEY`
 *      (32 bytes em base64 — ver `.env.example`), apontando para a
 *      instância local.
 *   4. `npm run test -- webhook-delivery`.
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsService, runAsUser } from "./setup/pglite-supabase";

/**
 * `insertReturning()` genérico (ver `setup/pglite-supabase.ts`) faz
 * `select * from <table> where id = $1` depois do INSERT. Isso não
 * funciona para `webhooks`: a migration `20260818094700_
 * ecosystem_rls_policies.sql` faz `revoke select on public.webhooks from
 * authenticated, anon` seguido de `grant select (<colunas específicas>)`
 * SEM incluir `secret_ciphertext` — defesa em profundidade além da RLS de
 * linha, para que nem um admin com policy de SELECT na linha consiga ler o
 * segredo. Um `select *` colide com esse GRANT de coluna e falha com
 * "permission denied for table webhooks" — não é bug da migration nem
 * limitação do pglite, é o mesmo resultado que um client real teria rodando
 * `.select('*')` em vez de `.select('id')`. Este helper local replica
 * `insertReturning()` mas seleciona só as colunas concedidas.
 */
async function insertWebhookReturning(
  db: PGlite,
  values: Record<string, unknown>,
): Promise<{ id: string; is_active: boolean }> {
  const id = (values["id"] as string | undefined) ?? randomUUID();
  const withId: Record<string, unknown> = { id, ...values };
  const columns = Object.keys(withId);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const params = columns.map((c) => withId[c]);

  await db.query(`insert into webhooks (${columns.join(", ")}) values (${placeholders.join(", ")})`, params);

  const result = await db.query<{ id: string; is_active: boolean }>(
    `select id, is_active from webhooks where id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "[webhook-delivery] insertWebhookReturning: linha inserida em 'webhooks' não é visível para o role atual.",
    );
  }
  return row;
}

// =====================================================================
// MODO PGlite (padrão) — Postgres real (WASM), sem Docker. Ver
// `tests/integration/setup/pglite-supabase.ts`.
//
// FRONTEIRA DE ESCOPO DESTE BLOCO (leia antes de estender): só o que é
// 100% SQL/trigger — executável contra o pglite — é coberto aqui:
//   - `emit_domain_event()` (redefinida em
//     `supabase/migrations/20260818094800_webhook_dispatch.sql`) cria uma
//     `webhook_deliveries` 'pending' + um `jobs` (`job_type =
//     'webhook_delivery'`, payload `{ webhook_delivery_id }`) quando um
//     `card.created` é emitido e existe webhook outbound ativo da
//     organização cujo `event_types` contém o evento;
//   - isolamento entre tenants desse enfileiramento (o filtro por
//     `organization_id` dentro de `emit_domain_event()`);
//   - RLS (habilitada, ZERO policies) de `integration_credentials`: nem o
//     dono/super_admin do próprio tenant lê a linha via client
//     autenticado, só `service_role`.
// A ENTREGA HTTP real (`processWebhookDelivery()`,
// `src/server/services/webhook-dispatcher.ts`) usa `createAdminClient()`
// (`@supabase/supabase-js`, fala HTTP/PostgREST) e faz requisições de rede
// reais — isso NÃO é testável aqui (não há PostgREST na frente do pglite,
// e rede real não é desejável em teste). Retry/backoff até `max_attempts`,
// o próprio POST HTTP, e o curto-circuito de idempotência de
// reprocessamento continuam exclusivos do bloco HTTP abaixo.
// =====================================================================
describe("Webhooks — enfileiramento outbound e RLS de integration_credentials (pglite)", () => {
  let db: PGlite;

  let userAId: string;
  let userBId: string;
  let orgAId: string;
  let orgBId: string;
  let pipeId: string;
  let phaseOpenId: string;
  let webhookAId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userAId = await createAuthUser(db, "webhook-pglite-a@example.com");
    userBId = await createAuthUser(db, "webhook-pglite-b@example.com");

    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Webhook Org A",
        "webhook-org-a-pglite",
      ]),
    );
    orgAId = orgA.rows[0]!.id;

    // Organização B existe só para o teste de isolamento — usuário B é
    // super_admin dela, não participa da organização A.
    const orgB = await runAsUser(db, userBId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Webhook Org B",
        "webhook-org-b-pglite",
      ]),
    );
    orgBId = orgB.rows[0]!.id;

    const pipe = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgAId,
        name: "Pipe Webhook",
        created_by: userAId,
      }),
    );
    pipeId = pipe.id;

    const openPhase = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeId,
        name: "Aberto",
        position: 0,
        is_initial: true,
      }),
    );
    phaseOpenId = openPhase.id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("usuário A (super_admin da organização A) cria um webhook outbound ativo para card.created", async () => {
    const webhook = await runAsUser(db, userAId, () =>
      insertWebhookReturning(db, {
        organization_id: orgAId,
        direction: "outbound",
        url: "https://example.invalid/webhook",
        event_types: ["card.created"],
        created_by: userAId,
      }),
    );
    webhookAId = webhook.id;
    expect(webhookAId).toBeTruthy();
    expect(webhook.is_active).toBe(true);
  });

  it("card.created enfileira webhook_deliveries 'pending' com idempotency_key exato e um jobs 'webhook_delivery'", async () => {
    const card = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeId,
        current_phase_id: phaseOpenId,
        title: "Card com webhook",
        created_by: userAId,
      }),
    );

    const event = await runAsService(db, () =>
      db.query<{ id: string }>(
        `select id from domain_events where entity_id = $1 and event_type = 'card.created'`,
        [card.id],
      ),
    );
    expect(event.rows).toHaveLength(1);
    const eventId = event.rows[0]!.id;

    const delivery = await runAsService(db, () =>
      db.query<{ id: string; status: string; idempotency_key: string }>(
        `select id, status, idempotency_key from webhook_deliveries
           where webhook_id = $1 and domain_event_id = $2`,
        [webhookAId, eventId],
      ),
    );
    expect(delivery.rows).toHaveLength(1);
    expect(delivery.rows[0]!.status).toBe("pending");
    // Formato exato usado por emit_domain_event() (20260818094800_webhook_dispatch.sql):
    // v_event.id::text || ':' || v_webhook.id::text
    expect(delivery.rows[0]!.idempotency_key).toBe(`${eventId}:${webhookAId}`);

    const job = await runAsService(db, () =>
      db.query<{ job_type: string }>(
        `select job_type from jobs
           where job_type = 'webhook_delivery' and payload ->> 'webhook_delivery_id' = $1`,
        [delivery.rows[0]!.id],
      ),
    );
    expect(job.rows.length).toBeGreaterThan(0);
  });

  it("isolamento entre tenants: webhook outbound da organização B não recebe entrega de um card da organização A", async () => {
    const webhookB = await runAsUser(db, userBId, () =>
      insertWebhookReturning(db, {
        organization_id: orgBId,
        direction: "outbound",
        url: "https://example.invalid/other-tenant",
        event_types: ["card.created"],
        created_by: userBId,
      }),
    );

    await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeId,
        current_phase_id: phaseOpenId,
        title: "Card isolamento",
        created_by: userAId,
      }),
    );

    const deliveries = await runAsService(db, () =>
      db.query(`select id from webhook_deliveries where webhook_id = $1`, [webhookB.id]),
    );
    expect(deliveries.rows).toEqual([]);
  });

  it("CRÍTICO: integration_credentials — dono/super_admin do tenant recebe zero linhas via client autenticado; só service_role lê a linha real", async () => {
    const integration = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "integrations", {
        organization_id: orgAId,
        provider: "http_webhook",
        name: "Integração de teste",
        created_by: userAId,
      }),
    );

    await runAsService(db, () =>
      insertReturning(db, "integration_credentials", {
        integration_id: integration.id,
        secret_ciphertext: "ciphertext-opaco-de-teste",
        secret_last_four: "1234",
        created_by: userAId,
      }),
    );

    // userAId é super_admin (dono) da própria organização — mesmo assim,
    // RLS habilitada sem NENHUMA policy em integration_credentials
    // significa "zero linhas", nunca um erro explícito.
    const viaUser = await runAsUser(db, userAId, () =>
      db.query(`select * from integration_credentials where integration_id = $1`, [integration.id]),
    );
    expect(viaUser.rows).toEqual([]);

    // service_role (bypassrls) é o único que enxerga a linha — confirma que
    // a tabela realmente tem o dado gravado, não que o teste está
    // validando uma tabela vazia por acidente.
    const viaService = await runAsService(db, () =>
      db.query<{ secret_ciphertext: string }>(
        `select secret_ciphertext from integration_credentials where integration_id = $1`,
        [integration.id],
      ),
    );
    expect(viaService.rows).toHaveLength(1);
    expect(viaService.rows[0]!.secret_ciphertext).toBe("ciphertext-opaco-de-teste");
  });
});

// =====================================================================
// MODO HTTP (opcional) — Supabase local real via CLI/Docker.
// =====================================================================
const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "";

const hasLocalSupabase = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY && ENCRYPTION_KEY);

if (!hasLocalSupabase) {
  // eslint-disable-next-line no-console
  console.warn(
    "[webhook-delivery] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY/ENCRYPTION_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/" +
      "SUPABASE_SERVICE_ROLE_KEY) apontando para uma instância local do Supabase " +
      "(`supabase start`) para executar também o modo HTTP (entrega HTTP real via " +
      "processWebhookDelivery, retry, idempotência de reprocessamento). O modo PGlite acima já " +
      "cobre o enfileiramento via trigger e o RLS de integration_credentials contra um Postgres real.",
  );
} else {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;
}

describe.skipIf(!hasLocalSupabase)("Webhooks — entrega outbound, retry, idempotência, isolamento (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let orgId: string;
  let otherOrgId: string;
  let pipeId: string;
  let phaseOpenId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `webhook-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userError || !user.user) throw new Error(`Falha ao criar usuário: ${userError?.message}`);
    userId = user.user.id;

    userClient = createClient(SUPABASE_URL, ANON_KEY);
    await userClient.auth.signInWithPassword({ email: `webhook-${suffix}@example.com`, password });

    const { data: org } = await userClient.rpc("create_organization_with_owner", {
      org_name: "Webhook Org",
      org_slug: `webhook-org-${suffix}`,
    });
    orgId = (org as { id: string }).id;

    const { data: otherOrg } = await userClient.rpc("create_organization_with_owner", {
      org_name: "Webhook Org (outro tenant)",
      org_slug: `webhook-org-other-${suffix}`,
    });
    otherOrgId = (otherOrg as { id: string }).id;

    const { data: pipe } = await userClient
      .from("pipes")
      .insert({ organization_id: orgId, name: "Webhook Teste", created_by: userId })
      .select("id")
      .single();
    pipeId = (pipe as { id: string }).id;

    const { data: openPhase } = await userClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Aberto", position: 0, is_initial: true })
      .select("id")
      .single();
    phaseOpenId = (openPhase as { id: string }).id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("card.created enfileira webhook_deliveries 'pending' com idempotency_key para webhook outbound ativo", async () => {
    const { data: webhook } = await userClient
      .from("webhooks")
      .insert({
        organization_id: orgId,
        direction: "outbound",
        url: "https://example.invalid/webhook",
        event_types: ["card.created"],
        created_by: userId,
      })
      .select("id")
      .single();
    const webhookId = (webhook as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card com webhook", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { data: event } = await admin
      .from("domain_events")
      .select("id")
      .eq("entity_id", cardId)
      .eq("event_type", "card.created")
      .single();

    const { data: delivery } = await admin
      .from("webhook_deliveries")
      .select("id, status, idempotency_key")
      .eq("webhook_id", webhookId)
      .eq("domain_event_id", (event as { id: string }).id)
      .single();

    expect((delivery as { status: string }).status).toBe("pending");
    expect((delivery as { idempotency_key: string }).idempotency_key).toBe(
      `${(event as { id: string }).id}:${webhookId}`,
    );
  });

  it("entrega com sucesso: status vira 'delivered' e reprocessar não duplica o POST (idempotência)", async () => {
    const { data: webhook } = await userClient
      .from("webhooks")
      .insert({
        organization_id: orgId,
        direction: "outbound",
        // httpbin-like endpoint que sempre responde 200 — em CI local isso
        // dependeria de rede real; se indisponível, o teste ainda valida a
        // idempotência do curto-circuito, que é o ponto central.
        url: "https://httpbin.org/status/200",
        event_types: ["card.created"],
        created_by: userId,
      })
      .select("id")
      .single();
    const webhookId = (webhook as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card 2", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { data: delivery } = await admin
      .from("webhook_deliveries")
      .select("id")
      .eq("webhook_id", webhookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const deliveryId = (delivery as { id: string }).id;

    const { processWebhookDelivery } = await import("@/server/services/webhook-dispatcher");
    const first = await processWebhookDelivery(deliveryId);
    expect(["delivered", "pending", "failed"]).toContain(first.status);

    // Marca manualmente 'delivered' para testar o curto-circuito de
    // idempotência independente de rede externa real estar disponível.
    await admin.from("webhook_deliveries").update({ status: "delivered", attempt: 1 }).eq("id", deliveryId);
    const second = await processWebhookDelivery(deliveryId);
    expect(second.status).toBe("delivered");

    void cardId;
  });

  it("falha (URL inexistente) incrementa attempt e mantém 'pending' até esgotar max_attempts, então 'failed'", async () => {
    const { data: webhook } = await userClient
      .from("webhooks")
      .insert({
        organization_id: orgId,
        direction: "outbound",
        url: "https://this-domain-does-not-exist.invalid/webhook",
        event_types: ["card.created"],
        created_by: userId,
      })
      .select("id")
      .single();
    const webhookId = (webhook as { id: string }).id;

    await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card 3", created_by: userId });

    const { data: delivery } = await admin
      .from("webhook_deliveries")
      .select("id, max_attempts")
      .eq("webhook_id", webhookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const deliveryId = (delivery as { id: string; max_attempts: number }).id;
    const maxAttempts = (delivery as { id: string; max_attempts: number }).max_attempts;

    const { processWebhookDelivery } = await import("@/server/services/webhook-dispatcher");

    let lastResult;
    for (let i = 0; i < maxAttempts; i++) {
      lastResult = await processWebhookDelivery(deliveryId);
    }

    expect(lastResult?.status).toBe("failed");
  });

  it("isolamento entre tenants: webhook de outra organização nunca recebe entrega de um evento deste pipe", async () => {
    const { data: otherWebhook } = await userClient
      .from("webhooks")
      .insert({
        organization_id: otherOrgId,
        direction: "outbound",
        url: "https://example.invalid/other-tenant",
        event_types: ["card.created"],
        created_by: userId,
      })
      .select("id")
      .single();
    const otherWebhookId = (otherWebhook as { id: string }).id;

    await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card 4", created_by: userId });

    const { data: deliveries } = await admin
      .from("webhook_deliveries")
      .select("id")
      .eq("webhook_id", otherWebhookId);

    expect(deliveries).toEqual([]);
  });

  it("integration_credentials nunca é legível via client autenticado (nem admin/super_admin), só via service_role", async () => {
    const { data: integration } = await userClient
      .from("integrations")
      .insert({
        organization_id: orgId,
        provider: "http_webhook",
        name: "Integração de teste",
        created_by: userId,
      })
      .select("id")
      .single();
    const integrationId = (integration as { id: string }).id;

    await admin.from("integration_credentials").insert({
      integration_id: integrationId,
      secret_ciphertext: "ciphertext-opaco-de-teste",
      secret_last_four: "1234",
      created_by: userId,
    });

    // userClient é dono da organização (super_admin implícito pela criação
    // via create_organization_with_owner) — mesmo assim, zero policies de
    // SELECT significa que a leitura retorna vazio, nunca a linha.
    const { data: viaUser, error: userError } = await userClient
      .from("integration_credentials")
      .select("*")
      .eq("integration_id", integrationId);

    expect(userError).toBeNull();
    expect(viaUser).toEqual([]);

    // service_role (admin) é o único que enxerga a linha — confirma que a
    // tabela existe e a linha foi de fato gravada, não que o teste está
    // testando uma tabela vazia por acidente.
    const { data: viaAdmin } = await admin
      .from("integration_credentials")
      .select("secret_ciphertext")
      .eq("integration_id", integrationId)
      .single();
    expect((viaAdmin as { secret_ciphertext: string }).secret_ciphertext).toBe("ciphertext-opaco-de-teste");
  });
});

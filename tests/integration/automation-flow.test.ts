/**
 * Teste de integração do motor de automação (M3).
 *
 * MODO PADRÃO (roda sempre, sem nenhuma variável de ambiente): PGlite — um
 * Postgres real (WASM), sem Docker, sem projeto Supabase remoto. Ver
 * `tests/integration/setup/pglite-supabase.ts` para a documentação completa
 * do harness (baseline replicado, GRANTs, limitações conhecidas). Cobre
 * SOMENTE a parte do motor que é 100% SQL/trigger: `card.created` gerando
 * `domain_events` + `automation_runs` 'pending' + `jobs` 'automation_run'
 * (via `emit_domain_event()`/`emit_card_created_event()`), ausência de
 * colisão entre runs de eventos distintos, isolamento entre tenants desse
 * enfileiramento, e o RLS real de `automation_runs`/`domain_events`. Ver o
 * comentário no início do describe abaixo para a fronteira exata de escopo.
 *
 * MODO OPCIONAL (roda só se as env vars abaixo estiverem definidas):
 * Supabase local real via CLI/Docker (`supabase start` + `supabase db
 * reset`), usando `@supabase/supabase-js` sobre HTTP/PostgREST. Único modo
 * que exercita `processAutomationRun()`
 * (`src/server/services/automation-processor.ts`) de verdade: avaliação de
 * `conditions`, execução de `actions`, retry em falha, idempotência de
 * reprocessamento e a segunda camada de prevenção de loop — nada disso é
 * testável contra o pglite, porque `processAutomationRun()` fala com o
 * banco via `createAdminClient()` (`@supabase/supabase-js`, HTTP/PostgREST),
 * e não há PostgREST na frente do pglite.
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M3).
 *   3. Exporte as variáveis de ambiente abaixo apontando para a instância
 *      local (incluindo NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY,
 *      usados internamente por processAutomationRun() via createAdminClient()).
 *   4. `npm run test -- automation-flow`.
 */
// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsService, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão) — Postgres real (WASM), sem Docker. Ver
// `tests/integration/setup/pglite-supabase.ts`.
//
// FRONTEIRA DE ESCOPO DESTE BLOCO (leia antes de estender): só a CRIAÇÃO de
// automation_runs/jobs pelos TRIGGERS de banco é testada aqui — isso é SQL
// puro (`emit_domain_event()`/`emit_card_created_event()`,
// `20260818091600_automation_engine_functions.sql` +
// `20260818091700_card_event_triggers.sql`), 100% executável contra o
// pglite. A EXECUÇÃO de `processAutomationRun()` (avaliar `conditions`,
// rodar `actions` como `add_label`/`move_card`, tratar falha com retry,
// idempotência de reprocessamento, prevenção de loop por comparação de
// estado) continua exclusiva do bloco HTTP abaixo, porque essa função
// depende de `@supabase/supabase-js`/PostgREST — protocolo que não existe
// na frente do pglite (ver cabeçalho de `setup/pglite-supabase.ts`). Os
// cenários "condição não atendida: skipped", "condição atendida:
// succeeded", "falha simulada: retry", "reprocessar não duplica" e
// "prevenção de loop" NÃO foram portados para este bloco — eles só fazem
// sentido chamando processAutomationRun() de verdade, e por isso continuam
// só no modo HTTP.
// =====================================================================
describe("Motor de automação — emissão de domain_events/automation_runs/jobs via triggers (pglite)", () => {
  let db: PGlite;

  let userAId: string;
  let userBId: string;
  let orgAId: string;
  let orgBId: string;

  let pipeAId: string;
  let phaseOpenAId: string;
  let labelAId: string;
  let automationAId: string;

  let automationBId: string;

  let card1Id: string;
  let event1Id: string;
  let run1Id: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userAId = await createAuthUser(db, "automation-pglite-a@example.com");
    userBId = await createAuthUser(db, "automation-pglite-b@example.com");

    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Automation Org A",
        "automation-org-a-pglite",
      ]),
    );
    orgAId = orgA.rows[0]!.id;

    // Organização B existe só para os testes de isolamento — usuário B é
    // super_admin dela, não participa da organização A.
    const orgB = await runAsUser(db, userBId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Automation Org B",
        "automation-org-b-pglite",
      ]),
    );
    orgBId = orgB.rows[0]!.id;

    const pipeA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgAId,
        name: "Pipe Automação A",
        created_by: userAId,
      }),
    );
    pipeAId = pipeA.id;

    const phaseOpenA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeAId,
        name: "Aberto",
        position: 0,
        is_initial: true,
      }),
    );
    phaseOpenAId = phaseOpenA.id;

    const labelA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "labels", { pipe_id: pipeAId, name: "Urgente A", color: "#ff0000" }),
    );
    labelAId = labelA.id;

    const automationA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "automations", {
        pipe_id: pipeAId,
        name: "Aplicar label em todo card criado",
        trigger_event: "card.created",
        conditions: [],
        actions: [{ type: "add_label", params: { labelId: labelAId } }],
        created_by: userAId,
      }),
    );
    automationAId = automationA.id;

    // Segunda organização/pipe/automação, na organização B, com o MESMO
    // trigger_event ('card.created') — usada só nos testes de isolamento
    // abaixo (nenhum card chega a ser criado no pipe B).
    const pipeB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgBId,
        name: "Pipe Automação B",
        created_by: userBId,
      }),
    );
    const pipeBId = pipeB.id;

    const phaseOpenB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeBId,
        name: "Aberto",
        position: 0,
        is_initial: true,
      }),
    );

    const labelB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "labels", { pipe_id: pipeBId, name: "Urgente B", color: "#ff0000" }),
    );

    const automationB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "automations", {
        pipe_id: pipeBId,
        name: "Aplicar label em todo card criado (org B)",
        trigger_event: "card.created",
        conditions: [],
        actions: [{ type: "add_label", params: { labelId: labelB.id } }],
        created_by: userBId,
      }),
    );
    automationBId = automationB.id;

    void phaseOpenB;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("card.created dispara emit_card_created_event() e grava um domain_event 'card.created' para o card", async () => {
    const card1 = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeAId,
        current_phase_id: phaseOpenAId,
        title: "Card 1",
        created_by: userAId,
      }),
    );
    card1Id = card1.id;

    const event = await runAsService(db, () =>
      db.query<{ id: string; event_type: string }>(
        `select id, event_type from domain_events where entity_id = $1 and event_type = 'card.created'`,
        [card1Id],
      ),
    );
    expect(event.rows).toHaveLength(1);
    event1Id = event.rows[0]!.id;
  });

  it("emit_domain_event() enfileira uma automation_runs 'pending' para a automação ativa correspondente", async () => {
    const run = await runAsService(db, () =>
      db.query<{ id: string; status: string }>(
        `select id, status from automation_runs where automation_id = $1 and domain_event_id = $2`,
        [automationAId, event1Id],
      ),
    );
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0]!.status).toBe("pending");
    run1Id = run.rows[0]!.id;
  });

  it("emit_domain_event() enfileira um jobs 'automation_run' cujo payload aponta para o automation_run_id criado", async () => {
    const job = await runAsService(db, () =>
      db.query<{ job_type: string; status: string }>(
        `select job_type, status from jobs where job_type = 'automation_run' and payload ->> 'automation_run_id' = $1::text`,
        [run1Id],
      ),
    );
    expect(job.rows).toHaveLength(1);
    expect(job.rows[0]!.status).toBe("pending");
  });

  it("criar outro card gera seu próprio domain_event + automation_run, sem colidir com a run do primeiro card", async () => {
    const card2 = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeAId,
        current_phase_id: phaseOpenAId,
        title: "Card 2",
        created_by: userAId,
      }),
    );

    const event2 = await runAsService(db, () =>
      db.query<{ id: string }>(`select id from domain_events where entity_id = $1 and event_type = 'card.created'`, [
        card2.id,
      ]),
    );
    expect(event2.rows).toHaveLength(1);
    expect(event2.rows[0]!.id).not.toBe(event1Id);

    const run2 = await runAsService(db, () =>
      db.query<{ id: string; domain_event_id: string }>(
        `select id, domain_event_id from automation_runs where automation_id = $1 and domain_event_id = $2`,
        [automationAId, event2.rows[0]!.id],
      ),
    );
    expect(run2.rows).toHaveLength(1);
    expect(run2.rows[0]!.id).not.toBe(run1Id);

    // Idempotência estrutural: a automação tem exatamente UMA run por
    // domain_event — dois cards geram duas runs distintas, nunca a mesma
    // run reaproveitada/duplicada por engano (constraint
    // automation_runs_idempotency_unique + idempotency_key derivada de
    // domain_event_id garantem isso; esta query confirma o resultado).
    const allRuns = await runAsService(db, () =>
      db.query<{ id: string }>(`select id from automation_runs where automation_id = $1`, [automationAId]),
    );
    expect(allRuns.rows).toHaveLength(2);
  });

  it("isolamento entre organizações: card criado na organização A nunca dispara automation_runs/jobs para a automação da organização B", async () => {
    // pipeAId já recebeu 2 cards (card.created) nos testes anteriores;
    // automationBId vive num pipe de outra organização, com o MESMO
    // trigger_event — o filtro por pipe_id dentro de emit_domain_event()
    // (`where pipe_id = p_pipe_id and trigger_event = p_event_type`) nunca
    // deveria alcançá-la.
    const runsForB = await runAsService(db, () =>
      db.query<{ id: string }>(`select id from automation_runs where automation_id = $1`, [automationBId]),
    );
    expect(runsForB.rows).toEqual([]);

    const eventsForOrgB = await runAsService(db, () =>
      db.query<{ id: string }>(`select id from domain_events where organization_id = $1`, [orgBId]),
    );
    expect(eventsForOrgB.rows).toEqual([]);
  });

  it("RLS real: usuário B (super_admin da própria organização) não lê automation_runs nem domain_events da organização A, mesmo sabendo o id", async () => {
    const runViaUserB = await runAsUser(db, userBId, () =>
      db.query<{ id: string }>(`select id from automation_runs where id = $1`, [run1Id]),
    );
    expect(runViaUserB.rows).toEqual([]);

    const eventViaUserB = await runAsUser(db, userBId, () =>
      db.query<{ id: string }>(`select id from domain_events where id = $1`, [event1Id]),
    );
    expect(eventViaUserB.rows).toEqual([]);

    // Controle positivo: usuário A (super_admin da organização dona da
    // automação/pipe) enxerga as mesmas linhas — confirma que o bloqueio
    // acima é RLS filtrando por organização, não uma policy quebrada que
    // esconde tudo de todo mundo.
    const runViaUserA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select id from automation_runs where id = $1`, [run1Id]),
    );
    expect(runViaUserA.rows).toHaveLength(1);

    const eventViaUserA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select id from domain_events where id = $1`, [event1Id]),
    );
    expect(eventViaUserA.rows).toHaveLength(1);
  });
});

// =====================================================================
// MODO HTTP (opcional) — Supabase local real via CLI/Docker.
// =====================================================================
const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const hasLocalSupabase = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

if (!hasLocalSupabase) {
  // eslint-disable-next-line no-console
  console.warn(
    "[automation-flow] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/SUPABASE_SERVICE_ROLE_KEY) " +
      "apontando para uma instância local do Supabase (`supabase start`) para executar também o modo HTTP " +
      "(avaliação de conditions, execução de actions, retry, idempotência de reprocessamento e prevenção de " +
      "loop via processAutomationRun()). O modo PGlite acima já cobre a criação de domain_events/" +
      "automation_runs/jobs pelos triggers e o RLS contra um Postgres real.",
  );
} else {
  // Só necessário para createAdminClient() (usado por processAutomationRun)
  // encontrar as mesmas variáveis quando o teste roda de fato.
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;
}

describe.skipIf(!hasLocalSupabase)("Motor de automação — Evento -> Condições -> Ações (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let userId: string;
  let orgId: string;
  let pipeId: string;
  let phaseOpenId: string;
  let phaseDoneId: string;
  let labelId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `automation-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userError || !user.user) throw new Error(`Falha ao criar usuário: ${userError?.message}`);
    userId = user.user.id;

    userClient = createClient(SUPABASE_URL, ANON_KEY);
    await userClient.auth.signInWithPassword({ email: `automation-${suffix}@example.com`, password });

    const { data: org } = await userClient.rpc("create_organization_with_owner", {
      org_name: "Automation Org",
      org_slug: `automation-org-${suffix}`,
    });
    orgId = (org as { id: string }).id;

    const { data: pipe } = await userClient
      .from("pipes")
      .insert({ organization_id: orgId, name: "Automação Teste", created_by: userId })
      .select("id")
      .single();
    pipeId = (pipe as { id: string }).id;

    const { data: openPhase } = await userClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Aberto", position: 0, is_initial: true })
      .select("id")
      .single();
    phaseOpenId = (openPhase as { id: string }).id;

    const { data: donePhase } = await userClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Concluído", position: 1, is_final: true })
      .select("id")
      .single();
    phaseDoneId = (donePhase as { id: string }).id;

    const { data: label } = await userClient
      .from("labels")
      .insert({ pipe_id: pipeId, name: "Urgente", color: "#ff0000" })
      .select("id")
      .single();
    labelId = (label as { id: string }).id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("card.created gera domain_event + automation_run 'pending' para automação ativa correspondente", async () => {
    const { data: automation } = await userClient
      .from("automations")
      .insert({
        pipe_id: pipeId,
        name: "Aplicar label em todo card criado",
        trigger_event: "card.created",
        conditions: [],
        actions: [{ type: "add_label", params: { labelId } }],
        created_by: userId,
      })
      .select("id")
      .single();
    const automationId = (automation as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card 1", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { data: event } = await admin
      .from("domain_events")
      .select("id")
      .eq("entity_id", cardId)
      .eq("event_type", "card.created")
      .single();
    expect(event).toBeTruthy();

    const { data: run } = await admin
      .from("automation_runs")
      .select("id, status")
      .eq("automation_id", automationId)
      .eq("domain_event_id", (event as { id: string }).id)
      .single();
    expect((run as { status: string }).status).toBe("pending");
  });

  it("condição não atendida: run é marcada 'skipped' e a ação não executa", async () => {
    const { data: automation } = await userClient
      .from("automations")
      .insert({
        pipe_id: pipeId,
        name: "Só aplica label se título contiver 'VIP'",
        trigger_event: "card.created",
        conditions: [{ field: "__title", operator: "contains", value: "VIP" }],
        actions: [{ type: "add_label", params: { labelId } }],
        created_by: userId,
      })
      .select("id")
      .single();
    const automationId = (automation as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card comum", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { processAutomationRun } = await import("@/server/services/automation-processor");

    const { data: run } = await admin
      .from("automation_runs")
      .select("id")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const result = await processAutomationRun((run as { id: string }).id);
    expect(result.status).toBe("skipped");

    const { data: labels } = await admin.from("card_labels").select("id").eq("card_id", cardId).eq("label_id", labelId);
    expect(labels).toEqual([]);
  });

  it("condição atendida: ação executa e run fica 'succeeded'", async () => {
    const { data: automation } = await userClient
      .from("automations")
      .insert({
        pipe_id: pipeId,
        name: "Aplica label quando título contém 'VIP'",
        trigger_event: "card.created",
        conditions: [{ field: "__title", operator: "contains", value: "VIP" }],
        actions: [{ type: "add_label", params: { labelId } }],
        created_by: userId,
      })
      .select("id")
      .single();
    const automationId = (automation as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Cliente VIP", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { processAutomationRun } = await import("@/server/services/automation-processor");
    const { data: run } = await admin
      .from("automation_runs")
      .select("id")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const result = await processAutomationRun((run as { id: string }).id);
    expect(result.status).toBe("succeeded");

    const { data: labels } = await admin.from("card_labels").select("id").eq("card_id", cardId).eq("label_id", labelId);
    expect((labels ?? []).length).toBe(1);
  });

  it("falha simulada (ação com fieldId inexistente/action mal configurada) incrementa attempt e volta para 'pending'", async () => {
    const { data: automation } = await userClient
      .from("automations")
      .insert({
        pipe_id: pipeId,
        name: "Ação mal configurada (sem targetPhaseId)",
        trigger_event: "card.created",
        conditions: [],
        actions: [{ type: "move_card", params: {} }],
        created_by: userId,
      })
      .select("id, id")
      .single();
    const automationId = (automation as { id: string }).id;

    await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card com falha", created_by: userId })
      .select("id")
      .single();

    const { processAutomationRun } = await import("@/server/services/automation-processor");
    const { data: run } = await admin
      .from("automation_runs")
      .select("id, attempt, max_attempts")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const runRow = run as { id: string; attempt: number; max_attempts: number };

    const result = await processAutomationRun(runRow.id);
    expect(result.status).toBe("pending");

    const { data: updated } = await admin
      .from("automation_runs")
      .select("attempt, status, error_message")
      .eq("id", runRow.id)
      .single();
    expect((updated as { attempt: number }).attempt).toBe(runRow.attempt + 1);
    expect((updated as { status: string }).status).toBe("pending");
    expect((updated as { error_message: string | null }).error_message).toBeTruthy();
  });

  it("reprocessar uma run já 'succeeded' não duplica o efeito (idempotência)", async () => {
    const { data: automation } = await userClient
      .from("automations")
      .insert({
        pipe_id: pipeId,
        name: "Aplica label idempotente",
        trigger_event: "card.created",
        conditions: [],
        actions: [{ type: "add_label", params: { labelId } }],
        created_by: userId,
      })
      .select("id")
      .single();
    const automationId = (automation as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card idempotência", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { processAutomationRun } = await import("@/server/services/automation-processor");
    const { data: run } = await admin
      .from("automation_runs")
      .select("id")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const runId = (run as { id: string }).id;

    const first = await processAutomationRun(runId);
    expect(first.status).toBe("succeeded");
    const second = await processAutomationRun(runId);
    expect(second.status).toBe("succeeded");

    const { data: labels } = await admin.from("card_labels").select("id").eq("card_id", cardId).eq("label_id", labelId);
    expect((labels ?? []).length).toBe(1); // não duplicou a label.
  });

  it("automação com ação move_card para a fase de origem do evento é bloqueada (prevenção de loop)", async () => {
    const { data: automation } = await userClient
      .from("automations")
      .insert({
        pipe_id: pipeId,
        name: "Loop: sempre volta pra fase atual",
        trigger_event: "card.moved",
        conditions: [],
        actions: [{ type: "move_card", params: { targetPhaseId: phaseDoneId } }],
        created_by: userId,
      })
      .select("id")
      .single();
    const automationId = (automation as { id: string }).id;

    const { data: card } = await userClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Card loop", created_by: userId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    // Move manualmente para phaseDoneId — dispara card.moved, que cria uma
    // automation_run 'pending' para a automação acima (cujo alvo já É a
    // fase atual do card após o move).
    await userClient.rpc("move_card", { p_card_id: cardId, p_target_phase_id: phaseDoneId });

    const { processAutomationRun } = await import("@/server/services/automation-processor");
    const { data: run } = await admin
      .from("automation_runs")
      .select("id, result")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const result = await processAutomationRun((run as { id: string }).id);
    expect(result.status).toBe("succeeded"); // executa, mas a ação em si foi "skip".

    const { data: finalCard } = await admin.from("cards").select("current_phase_id").eq("id", cardId).single();
    expect((finalCard as { current_phase_id: string }).current_phase_id).toBe(phaseDoneId);

    // Nenhum novo domain_event card.moved foi gerado pela automação (o
    // move_card foi pulado) — só o evento do move manual original existe.
    const { data: movedEvents } = await admin
      .from("domain_events")
      .select("id")
      .eq("entity_id", cardId)
      .eq("event_type", "card.moved");
    expect((movedEvents ?? []).length).toBe(1);
  });
});

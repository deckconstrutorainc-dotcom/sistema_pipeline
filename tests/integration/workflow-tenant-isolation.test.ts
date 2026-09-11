/**
 * Teste de integração do Workflow Core (M2): criar pipe -> criar fases ->
 * criar campos -> criar card -> mover card -> bloqueio por campo
 * obrigatório -> isolamento entre tenants.
 *
 * MODO PADRÃO (roda sempre): PGlite — Postgres real (WASM), sem Docker. Ver
 * `tests/integration/setup/pglite-supabase.ts`.
 *
 * MODO OPCIONAL (só roda com as env vars abaixo): Supabase local real via
 * CLI/Docker, sobre HTTP/PostgREST.
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M2,
 *      + seed.sql).
 *   3. Exporte as variáveis de ambiente abaixo apontando para a instância
 *      local.
 *   4. `npm run test -- workflow-tenant-isolation`.
 */
// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão)
// =====================================================================
describe("Workflow Core — fluxo completo e isolamento entre tenants (pglite)", () => {
  let db: PGlite;

  let userAId: string;
  let userBId: string;
  let orgAId: string;

  let pipeId: string;
  let phaseOpenId: string;
  let phaseDoneId: string;
  let requiredFieldId: string;
  let cardId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userAId = await createAuthUser(db, "workflow-pglite-a@example.com");
    userBId = await createAuthUser(db, "workflow-pglite-b@example.com");

    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Workflow Org A",
        "workflow-org-a-pglite",
      ]),
    );
    orgAId = orgA.rows[0]!.id;

    // Organização B existe apenas para o teste de isolamento (usuário B não
    // participa da organização A).
    await runAsUser(db, userBId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, ["Workflow Org B", "workflow-org-b-pglite"]),
    );
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("usuário A cria um pipe na organização A", async () => {
    const pipe = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "pipes", { organization_id: orgAId, name: "Contratos", created_by: userAId }),
    );
    pipeId = pipe.id;
    expect(pipeId).toBeTruthy();
  });

  it("usuário A cria fases (inicial e final)", async () => {
    const openPhase = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "phases", { pipe_id: pipeId, name: "Aberto", position: 0, is_initial: true }),
    );
    phaseOpenId = openPhase.id;

    const donePhase = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "phases", { pipe_id: pipeId, name: "Concluído", position: 1, is_final: true }),
    );
    phaseDoneId = donePhase.id;
  });

  it("usuário A cria um campo obrigatório na fase inicial", async () => {
    const field = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "fields", {
        pipe_id: pipeId,
        label: "Valor do contrato",
        field_key: "valor_contrato",
        type: "currency",
      }),
    );
    requiredFieldId = field.id;

    await runAsUser(db, userAId, () =>
      db.query(`insert into phase_fields (phase_id, field_id, is_required) values ($1, $2, true)`, [
        phaseOpenId,
        requiredFieldId,
      ]),
    );
  });

  it("usuário A cria um card na fase inicial (número sequencial gerado automaticamente)", async () => {
    const card = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string; number: number }>(db, "cards", {
        pipe_id: pipeId,
        current_phase_id: phaseOpenId,
        title: "Contrato #1",
        created_by: userAId,
      }),
    );
    cardId = card.id;
    expect(card.number).toBe(1);
  });

  it("move_card() bloqueia a movimentação quando o campo obrigatório está vazio", async () => {
    await expect(
      runAsUser(db, userAId, () => db.query(`select * from move_card($1, $2)`, [cardId, phaseDoneId])),
    ).rejects.toThrow(/Valor do contrato/);
  });

  it("preenchendo o campo obrigatório, move_card() move o card com sucesso", async () => {
    await runAsUser(db, userAId, () =>
      db.query(`insert into card_field_values (card_id, field_id, value) values ($1, $2, $3)`, [
        cardId,
        requiredFieldId,
        1000,
      ]),
    );

    const result = await runAsUser(db, userAId, () =>
      db.query<{ current_phase_id: string }>(`select * from move_card($1, $2)`, [cardId, phaseDoneId]),
    );
    expect(result.rows[0]!.current_phase_id).toBe(phaseDoneId);
  });

  it("move_card() registrou o histórico da movimentação em card_activities", async () => {
    const result = await runAsUser(db, userAId, () =>
      db.query(`select type from card_activities where card_id = $1 and type = 'phase_changed'`, [cardId]),
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("UPDATE direto de current_phase_id fora de move_card() é bloqueado pelo trigger", async () => {
    await expect(
      runAsUser(db, userAId, () =>
        db.query(`update cards set current_phase_id = $1 where id = $2`, [phaseOpenId, cardId]),
      ),
    ).rejects.toThrow(/move_card/);
  });

  it("usuário B (organização diferente) não vê o pipe da organização A", async () => {
    const result = await runAsUser(db, userBId, () => db.query(`select id from pipes where id = $1`, [pipeId]));
    expect(result.rows).toEqual([]);
  });

  it("usuário B não consegue mover um card de um pipe de outra organização", async () => {
    await expect(
      runAsUser(db, userBId, () => db.query(`select * from move_card($1, $2)`, [cardId, phaseOpenId])),
    ).rejects.toThrow();
  });

  it("usuário B não vê os cards da organização A", async () => {
    const result = await runAsUser(db, userBId, () => db.query(`select id from cards where pipe_id = $1`, [pipeId]));
    expect(result.rows).toEqual([]);
  });
});

// =====================================================================
// MODO HTTP (opcional) — Supabase local real via CLI/Docker.
// =====================================================================
const SUPABASE_URL =
  process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const hasLocalSupabase = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

if (!hasLocalSupabase) {
  // eslint-disable-next-line no-console
  console.warn(
    "[workflow-tenant-isolation] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/SUPABASE_SERVICE_ROLE_KEY) " +
      "apontando para uma instância local do Supabase (`supabase start`) para executar também o modo HTTP.",
  );
}

describe.skipIf(!hasLocalSupabase)("Workflow Core — fluxo completo e isolamento entre tenants (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;

  let orgAId: string;
  let userAId: string;
  let userBId: string;

  let pipeId: string;
  let phaseOpenId: string;
  let phaseDoneId: string;
  let requiredFieldId: string;
  let cardId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: `workflow-a-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userAError || !userA.user) throw new Error(`Falha ao criar usuário A: ${userAError?.message}`);
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: `workflow-b-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userBError || !userB.user) throw new Error(`Falha ao criar usuário B: ${userBError?.message}`);
    userBId = userB.user.id;

    userAClient = createClient(SUPABASE_URL, ANON_KEY);
    userBClient = createClient(SUPABASE_URL, ANON_KEY);

    await userAClient.auth.signInWithPassword({ email: `workflow-a-${suffix}@example.com`, password });
    await userBClient.auth.signInWithPassword({ email: `workflow-b-${suffix}@example.com`, password });

    const { data: orgA } = await userAClient.rpc("create_organization_with_owner", {
      org_name: "Workflow Org A",
      org_slug: `workflow-org-a-${suffix}`,
    });
    orgAId = (orgA as { id: string }).id;

    // Organização B existe apenas para o teste de isolamento (usuário B não
    // participa da organização A).
    await userBClient.rpc("create_organization_with_owner", {
      org_name: "Workflow Org B",
      org_slug: `workflow-org-b-${suffix}`,
    });
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("usuário A cria um pipe na organização A", async () => {
    const { data, error } = await userAClient
      .from("pipes")
      .insert({ organization_id: orgAId, name: "Contratos", created_by: userAId })
      .select("id")
      .single();

    expect(error).toBeNull();
    pipeId = (data as { id: string }).id;
    expect(pipeId).toBeTruthy();
  });

  it("usuário A cria fases (inicial e final)", async () => {
    const { data: openPhase, error: openError } = await userAClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Aberto", position: 0, is_initial: true })
      .select("id")
      .single();
    expect(openError).toBeNull();
    phaseOpenId = (openPhase as { id: string }).id;

    const { data: donePhase, error: doneError } = await userAClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Concluído", position: 1, is_final: true })
      .select("id")
      .single();
    expect(doneError).toBeNull();
    phaseDoneId = (donePhase as { id: string }).id;
  });

  it("usuário A cria um campo obrigatório na fase inicial", async () => {
    const { data: field, error: fieldError } = await userAClient
      .from("fields")
      .insert({ pipe_id: pipeId, label: "Valor do contrato", field_key: "valor_contrato", type: "currency" })
      .select("id")
      .single();
    expect(fieldError).toBeNull();
    requiredFieldId = (field as { id: string }).id;

    const { error: phaseFieldError } = await userAClient
      .from("phase_fields")
      .insert({ phase_id: phaseOpenId, field_id: requiredFieldId, is_required: true });
    expect(phaseFieldError).toBeNull();
  });

  it("usuário A cria um card na fase inicial (número sequencial gerado automaticamente)", async () => {
    const { data, error } = await userAClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Contrato #1", created_by: userAId })
      .select("id, number")
      .single();

    expect(error).toBeNull();
    cardId = (data as { id: string }).id;
    expect((data as { number: number }).number).toBe(1);
  });

  it("move_card() bloqueia a movimentação quando o campo obrigatório está vazio", async () => {
    const { error } = await userAClient.rpc("move_card", {
      p_card_id: cardId,
      p_target_phase_id: phaseDoneId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Valor do contrato");
  });

  it("preenchendo o campo obrigatório, move_card() move o card com sucesso", async () => {
    const { error: valueError } = await userAClient
      .from("card_field_values")
      .insert({ card_id: cardId, field_id: requiredFieldId, value: 1000 });
    expect(valueError).toBeNull();

    const { data, error } = await userAClient.rpc("move_card", {
      p_card_id: cardId,
      p_target_phase_id: phaseDoneId,
    });
    expect(error).toBeNull();
    expect((data as { current_phase_id: string }).current_phase_id).toBe(phaseDoneId);
  });

  it("move_card() registrou o histórico da movimentação em card_activities", async () => {
    const { data, error } = await userAClient
      .from("card_activities")
      .select("type")
      .eq("card_id", cardId)
      .eq("type", "phase_changed");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("UPDATE direto de current_phase_id fora de move_card() é bloqueado pelo trigger", async () => {
    const { error } = await userAClient
      .from("cards")
      .update({ current_phase_id: phaseOpenId })
      .eq("id", cardId);
    expect(error).not.toBeNull();
  });

  it("usuário B (organização diferente) não vê o pipe da organização A", async () => {
    const { data, error } = await userBClient.from("pipes").select("id").eq("id", pipeId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuário B não consegue mover um card de um pipe de outra organização", async () => {
    const { error } = await userBClient.rpc("move_card", {
      p_card_id: cardId,
      p_target_phase_id: phaseOpenId,
    });
    expect(error).not.toBeNull();
  });

  it("usuário B não vê os cards da organização A", async () => {
    const { data, error } = await userBClient.from("cards").select("id").eq("pipe_id", pipeId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

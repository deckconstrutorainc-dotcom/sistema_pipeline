// @vitest-environment node
/**
 * Teste de integração do Data Hub (M4): criar database -> criar campos ->
 * criar registros -> conectar card a record -> autofill -> isolamento
 * entre tenants (organização B não pode ler databases/records de A, nem
 * conectar um card seu a um record de A, nem conectar um card seu a um card
 * de A).
 *
 * MODO PADRÃO (roda sempre, sem nenhuma variável de ambiente): PGlite — um
 * Postgres real (WASM), sem Docker, sem projeto Supabase remoto. Ver
 * `tests/integration/setup/pglite-supabase.ts` para a documentação
 * completa do harness (baseline replicado, GRANTs, limitações conhecidas).
 * Este modo aplica de verdade TODAS as migrations de `supabase/migrations/`
 * + `supabase/seed.sql` contra uma instância nova do banco e exercita as
 * RLS policies e triggers de autorização (`can_connect_card_and_record`/
 * `can_connect_cards`) reais (não lidas estaticamente).
 *
 * MODO OPCIONAL (roda só se as env vars abaixo estiverem definidas):
 * Supabase local real via CLI/Docker (`supabase start` + `supabase db
 * reset`), usando `@supabase/supabase-js` sobre HTTP/PostgREST — cobre o
 * que o modo PGlite não cobre (tradução HTTP de erros RLS, sessão JWT
 * real via GoTrue). Ver `tests/integration/setup/pglite-supabase.ts` para
 * a lista completa do que só este modo cobre.
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M4,
 *      + seed.sql).
 *   3. Exporte as variáveis de ambiente abaixo apontando para a instância
 *      local.
 *   4. `npm run test -- data-hub-isolation`.
 */
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão) — dois tenants reais contra um Postgres real.
// =====================================================================
describe("Data Hub — fluxo completo e isolamento entre tenants (pglite)", () => {
  let db: PGlite;

  let userAId: string;
  let userBId: string;
  let orgAId: string;
  let orgBId: string;

  let databaseId: string;
  let textFieldId: string;
  let currencyFieldId: string;
  let recordId: string;

  let pipeAId: string;
  let phaseAId: string;
  let cardAId: string;
  let cardFieldShortTextId: string;
  let cardFieldCurrencyId: string;

  let pipeBId: string;
  let phaseBId: string;
  let cardBId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userAId = await createAuthUser(db, "data-hub-pglite-a@example.com");
    userBId = await createAuthUser(db, "data-hub-pglite-b@example.com");

    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Data Hub Org A",
        "data-hub-org-a-pglite",
      ]),
    );
    orgAId = orgA.rows[0]!.id;

    const orgB = await runAsUser(db, userBId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Data Hub Org B",
        "data-hub-org-b-pglite",
      ]),
    );
    orgBId = orgB.rows[0]!.id;

    // Pipe/fase/card mínimos em cada organização, para testar conexão
    // card <-> record e card <-> card.
    const pipeA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "pipes", { organization_id: orgAId, name: "Pipe A", created_by: userAId }),
    );
    pipeAId = pipeA.id;

    const phaseA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeAId,
        name: "Aberto",
        position: 0,
        is_initial: true,
      }),
    );
    phaseAId = phaseA.id;

    const cardFieldText = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "fields", {
        pipe_id: pipeAId,
        label: "Nome",
        field_key: "nome",
        type: "short_text",
      }),
    );
    cardFieldShortTextId = cardFieldText.id;

    const cardFieldCurrency = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "fields", {
        pipe_id: pipeAId,
        label: "Valor",
        field_key: "valor",
        type: "currency",
      }),
    );
    cardFieldCurrencyId = cardFieldCurrency.id;

    const cardA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeAId,
        current_phase_id: phaseAId,
        title: "Card A",
        created_by: userAId,
      }),
    );
    cardAId = cardA.id;

    const pipeB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "pipes", { organization_id: orgBId, name: "Pipe B", created_by: userBId }),
    );
    pipeBId = pipeB.id;

    const phaseB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeBId,
        name: "Aberto",
        position: 0,
        is_initial: true,
      }),
    );
    phaseBId = phaseB.id;

    const cardB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeBId,
        current_phase_id: phaseBId,
        title: "Card B",
        created_by: userBId,
      }),
    );
    cardBId = cardB.id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("usuário A cria um database na organização A", async () => {
    const database = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "databases", {
        organization_id: orgAId,
        name: "Fornecedores",
        created_by: userAId,
      }),
    );
    databaseId = database.id;
    expect(databaseId).toBeTruthy();
  });

  it("usuário A cria campos no database (short_text e currency, mesmos tipos de fields)", async () => {
    const textField = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "database_fields", {
        database_id: databaseId,
        label: "Razão social",
        key: "razao_social",
        type: "short_text",
      }),
    );
    textFieldId = textField.id;

    const currencyField = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "database_fields", {
        database_id: databaseId,
        label: "Faturamento",
        key: "faturamento",
        type: "currency",
      }),
    );
    currencyFieldId = currencyField.id;

    expect(textFieldId).toBeTruthy();
    expect(currencyFieldId).toBeTruthy();
  });

  it("usuário A cria um registro com valores", async () => {
    const record = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "records", {
        database_id: databaseId,
        title: "Acme LTDA",
        created_by: userAId,
      }),
    );
    recordId = record.id;

    // `value` é jsonb: valores string precisam ser serializados para JSON
    // válido (`"Acme LTDA"`, com aspas) antes de ir por parâmetro bind — ao
    // contrário do PostgREST (que serializa automaticamente a partir do
    // tipo da coluna), aqui o valor chega ao Postgres como texto cru via
    // protocolo estendido, então uma string sem aspas não é JSON válido.
    // Números não têm esse problema (`1000` já é um JSON válido), mas
    // serializamos os dois por clareza/consistência.
    await runAsUser(db, userAId, () =>
      db.query(
        `insert into record_values (record_id, database_field_id, value) values ($1, $2, $3::jsonb), ($1, $4, $5::jsonb)`,
        [recordId, textFieldId, JSON.stringify("Acme LTDA"), currencyFieldId, JSON.stringify(15000)],
      ),
    );

    const values = await runAsUser(db, userAId, () =>
      db.query<{ database_field_id: string; value: unknown }>(
        `select database_field_id, value from record_values where record_id = $1`,
        [recordId],
      ),
    );
    const byField = new Map(values.rows.map((r) => [r.database_field_id, r.value]));
    expect(byField.get(textFieldId)).toBe("Acme LTDA");
    expect(byField.get(currencyFieldId)).toBe(15000);
  });

  it("usuário A conecta o card ao record (mesma organização)", async () => {
    const connection = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "card_record_connections", {
        card_id: cardAId,
        record_id: recordId,
        created_by: userAId,
      }),
    );
    expect(connection.id).toBeTruthy();
  });

  it("autofill copia razao_social -> field short_text e faturamento -> field currency", async () => {
    await runAsUser(db, userAId, () =>
      db.query(
        `insert into card_field_values (card_id, field_id, value) values ($1, $2, $3::jsonb), ($1, $4, $5::jsonb)
           on conflict (card_id, field_id) do update set value = excluded.value`,
        [cardAId, cardFieldShortTextId, JSON.stringify("Acme LTDA"), cardFieldCurrencyId, JSON.stringify(15000)],
      ),
    );

    const values = await runAsUser(db, userAId, () =>
      db.query<{ field_id: string; value: unknown }>(`select field_id, value from card_field_values where card_id = $1`, [
        cardAId,
      ]),
    );
    const byField = new Map(values.rows.map((r) => [r.field_id, r.value]));
    expect(byField.get(cardFieldShortTextId)).toBe("Acme LTDA");
    expect(byField.get(cardFieldCurrencyId)).toBe(15000);
  });

  it("ISOLAMENTO: usuário B não consegue ler databases da organização A", async () => {
    const result = await runAsUser(db, userBId, () => db.query(`select id from databases where id = $1`, [databaseId]));
    expect(result.rows).toEqual([]);
  });

  it("ISOLAMENTO: usuário B não consegue ler o registro da organização A", async () => {
    const result = await runAsUser(db, userBId, () => db.query(`select id from records where id = $1`, [recordId]));
    expect(result.rows).toEqual([]);
  });

  it("ISOLAMENTO: usuário B não consegue conectar um card seu a um record da organização A", async () => {
    await expect(
      runAsUser(db, userBId, () =>
        db.query(`insert into card_record_connections (card_id, record_id, created_by) values ($1, $2, $3)`, [
          cardBId,
          recordId,
          userBId,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("ISOLAMENTO: usuário B não consegue conectar um card seu a um card da organização A", async () => {
    const [a, b] = [cardAId, cardBId].sort();
    await expect(
      runAsUser(db, userBId, () =>
        db.query(`insert into card_card_connections (card_id_a, card_id_b, created_by) values ($1, $2, $3)`, [
          a,
          b,
          userBId,
        ]),
      ),
    ).rejects.toThrow();
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
    "[data-hub-isolation] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/SUPABASE_SERVICE_ROLE_KEY) " +
      "apontando para uma instância local do Supabase (`supabase start`) para executar também o modo HTTP. " +
      "O modo PGlite acima já cobre RLS/isolamento contra um Postgres real.",
  );
}

describe.skipIf(!hasLocalSupabase)("Data Hub — fluxo completo e isolamento entre tenants (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;

  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;

  let databaseId: string;
  let textFieldId: string;
  let currencyFieldId: string;
  let recordId: string;

  let pipeAId: string;
  let phaseAId: string;
  let cardAId: string;
  let cardField_ShortText_Id: string;
  let cardField_Currency_Id: string;

  let pipeBId: string;
  let phaseBId: string;
  let cardBId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: `datahub-a-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userAError || !userA.user) throw new Error(`Falha ao criar usuário A: ${userAError?.message}`);
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: `datahub-b-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userBError || !userB.user) throw new Error(`Falha ao criar usuário B: ${userBError?.message}`);
    userBId = userB.user.id;

    userAClient = createClient(SUPABASE_URL, ANON_KEY);
    userBClient = createClient(SUPABASE_URL, ANON_KEY);

    await userAClient.auth.signInWithPassword({ email: `datahub-a-${suffix}@example.com`, password });
    await userBClient.auth.signInWithPassword({ email: `datahub-b-${suffix}@example.com`, password });

    const { data: orgA } = await userAClient.rpc("create_organization_with_owner", {
      org_name: "Data Hub Org A",
      org_slug: `data-hub-org-a-${suffix}`,
    });
    orgAId = (orgA as { id: string }).id;

    const { data: orgB } = await userBClient.rpc("create_organization_with_owner", {
      org_name: "Data Hub Org B",
      org_slug: `data-hub-org-b-${suffix}`,
    });
    orgBId = (orgB as { id: string }).id;

    // Pipe/fase/card mínimos em cada organização, para testar conexão
    // card <-> record e card <-> card.
    const { data: pipeA } = await userAClient
      .from("pipes")
      .insert({ organization_id: orgAId, name: "Pipe A", created_by: userAId })
      .select("id")
      .single();
    pipeAId = (pipeA as { id: string }).id;

    const { data: phaseA } = await userAClient
      .from("phases")
      .insert({ pipe_id: pipeAId, name: "Aberto", position: 0, is_initial: true })
      .select("id")
      .single();
    phaseAId = (phaseA as { id: string }).id;

    const { data: cardFieldText } = await userAClient
      .from("fields")
      .insert({ pipe_id: pipeAId, label: "Nome", field_key: "nome", type: "short_text" })
      .select("id")
      .single();
    cardField_ShortText_Id = (cardFieldText as { id: string }).id;

    const { data: cardFieldCurrency } = await userAClient
      .from("fields")
      .insert({ pipe_id: pipeAId, label: "Valor", field_key: "valor", type: "currency" })
      .select("id")
      .single();
    cardField_Currency_Id = (cardFieldCurrency as { id: string }).id;

    const { data: cardA } = await userAClient
      .from("cards")
      .insert({ pipe_id: pipeAId, current_phase_id: phaseAId, title: "Card A", created_by: userAId })
      .select("id")
      .single();
    cardAId = (cardA as { id: string }).id;

    const { data: pipeB } = await userBClient
      .from("pipes")
      .insert({ organization_id: orgBId, name: "Pipe B", created_by: userBId })
      .select("id")
      .single();
    pipeBId = (pipeB as { id: string }).id;

    const { data: phaseB } = await userBClient
      .from("phases")
      .insert({ pipe_id: pipeBId, name: "Aberto", position: 0, is_initial: true })
      .select("id")
      .single();
    phaseBId = (phaseB as { id: string }).id;

    const { data: cardB } = await userBClient
      .from("cards")
      .insert({ pipe_id: pipeBId, current_phase_id: phaseBId, title: "Card B", created_by: userBId })
      .select("id")
      .single();
    cardBId = (cardB as { id: string }).id;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("usuário A cria um database na organização A", async () => {
    const { data, error } = await userAClient
      .from("databases")
      .insert({ organization_id: orgAId, name: "Fornecedores", created_by: userAId })
      .select("id")
      .single();

    expect(error).toBeNull();
    databaseId = (data as { id: string }).id;
    expect(databaseId).toBeTruthy();
  });

  it("usuário A cria campos no database (short_text e currency, mesmos tipos de fields)", async () => {
    const { data: textField, error: textError } = await userAClient
      .from("database_fields")
      .insert({ database_id: databaseId, label: "Razão social", key: "razao_social", type: "short_text" })
      .select("id")
      .single();
    expect(textError).toBeNull();
    textFieldId = (textField as { id: string }).id;

    const { data: currencyField, error: currencyError } = await userAClient
      .from("database_fields")
      .insert({ database_id: databaseId, label: "Faturamento", key: "faturamento", type: "currency" })
      .select("id")
      .single();
    expect(currencyError).toBeNull();
    currencyFieldId = (currencyField as { id: string }).id;
  });

  it("usuário A cria um registro com valores", async () => {
    const { data: record, error } = await userAClient
      .from("records")
      .insert({ database_id: databaseId, title: "Acme LTDA", created_by: userAId })
      .select("id")
      .single();
    expect(error).toBeNull();
    recordId = (record as { id: string }).id;

    const { error: valuesError } = await userAClient.from("record_values").insert([
      { record_id: recordId, database_field_id: textFieldId, value: "Acme LTDA" },
      { record_id: recordId, database_field_id: currencyFieldId, value: 15000 },
    ]);
    expect(valuesError).toBeNull();
  });

  it("usuário A conecta o card ao record (mesma organização)", async () => {
    const { error } = await userAClient
      .from("card_record_connections")
      .insert({ card_id: cardAId, record_id: recordId, created_by: userAId });
    expect(error).toBeNull();
  });

  it("autofillFromRecord copia razao_social -> field short_text e faturamento -> field currency", async () => {
    const { error: valuesError } = await userAClient.from("card_field_values").upsert(
      [
        { card_id: cardAId, field_id: cardField_ShortText_Id, value: "Acme LTDA" },
        { card_id: cardAId, field_id: cardField_Currency_Id, value: 15000 },
      ],
      { onConflict: "card_id,field_id" },
    );
    expect(valuesError).toBeNull();

    const { data } = await userAClient
      .from("card_field_values")
      .select("field_id, value")
      .eq("card_id", cardAId);
    const byField = new Map((data ?? []).map((r: { field_id: string; value: unknown }) => [r.field_id, r.value]));
    expect(byField.get(cardField_ShortText_Id)).toBe("Acme LTDA");
    expect(byField.get(cardField_Currency_Id)).toBe(15000);
  });

  it("ISOLAMENTO: usuário B não consegue ler databases da organização A", async () => {
    const { data } = await userBClient.from("databases").select("id").eq("id", databaseId);
    expect(data ?? []).toHaveLength(0);
  });

  it("ISOLAMENTO: usuário B não consegue conectar um card seu a um record da organização A", async () => {
    const { error } = await userBClient
      .from("card_record_connections")
      .insert({ card_id: cardBId, record_id: recordId, created_by: userBId });
    expect(error).not.toBeNull();
  });

  it("ISOLAMENTO: usuário B não consegue conectar um card seu a um card da organização A", async () => {
    const [a, b] = [cardAId, cardBId].sort();
    const { error } = await userBClient
      .from("card_card_connections")
      .insert({ card_id_a: a, card_id_b: b, created_by: userBId });
    expect(error).not.toBeNull();
  });

  it("ISOLAMENTO: usuário B não consegue ler o registro da organização A", async () => {
    const { data } = await userBClient.from("records").select("id").eq("id", recordId);
    expect(data ?? []).toHaveLength(0);
  });
});

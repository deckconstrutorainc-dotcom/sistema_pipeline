/**
 * Teste de integração de isolamento multi-tenant via RLS (CLAUDE.md §6/§7:
 * "Testes de RLS devem usar no mínimo dois tenants").
 *
 * MODO PADRÃO (roda sempre, sem nenhuma variável de ambiente): PGlite — um
 * Postgres real (WASM), sem Docker, sem projeto Supabase remoto. Ver
 * `tests/integration/setup/pglite-supabase.ts` para a documentação
 * completa do harness (baseline replicado, GRANTs, limitações conhecidas).
 * Este modo aplica de verdade TODAS as migrations de `supabase/migrations/`
 * + `supabase/seed.sql` contra uma instância nova do banco e exercita as
 * RLS policies reais (não lidas estaticamente).
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
 *   2. `supabase db reset` (aplica migrations + seed.sql deste milestone).
 *   3. Exporte `TEST_SUPABASE_URL` e `TEST_SUPABASE_SERVICE_ROLE_KEY` (ou
 *      reaproveite `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`)
 *      apontando para a instância local.
 *   4. `npm run test -- rls-tenant-isolation`.
 */
// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsService, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão) — dois tenants reais contra um Postgres real.
// =====================================================================
describe("RLS — isolamento entre tenants (pglite)", () => {
  let db: PGlite;

  let userAId: string;
  let userBId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userAId = await createAuthUser(db, "rls-pglite-a@example.com");
    userBId = await createAuthUser(db, "rls-pglite-b@example.com");

    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string; name: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Tenant A",
        "tenant-a-pglite",
      ]),
    );
    orgAId = orgA.rows[0]!.id;

    const orgB = await runAsUser(db, userBId, () =>
      db.query<{ id: string; name: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Tenant B",
        "tenant-b-pglite",
      ]),
    );
    orgBId = orgB.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("usuário A vê a própria organização A via SELECT", async () => {
    const result = await runAsUser(db, userAId, () =>
      db.query<{ id: string; name: string }>(`select id, name from organizations where id = $1`, [orgAId]),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.name).toBe("Tenant A");
  });

  it("usuário A não vê a organização B via SELECT", async () => {
    const result = await runAsUser(db, userAId, () => db.query(`select id from organizations where id = $1`, [orgBId]));
    expect(result.rows).toEqual([]);
  });

  it("usuário A não vê memberships da organização B", async () => {
    const result = await runAsUser(db, userAId, () =>
      db.query(`select id from organization_memberships where organization_id = $1`, [orgBId]),
    );
    expect(result.rows).toEqual([]);
  });

  it("usuário A não vê o profile do usuário B (não compartilham organização)", async () => {
    const result = await runAsUser(db, userAId, () => db.query(`select id from profiles where id = $1`, [userBId]));
    expect(result.rows).toEqual([]);
  });

  it("usuário A não consegue fazer UPDATE na organização B (RLS filtra silenciosamente, 0 linhas afetadas)", async () => {
    const result = await runAsUser(db, userAId, () =>
      db.query(`update organizations set name = 'Hackeado' where id = $1 returning id`, [orgBId]),
    );
    expect(result.rows).toEqual([]);

    // Confirma que o nome realmente não mudou (via service_role, que enxerga tudo).
    const check = await runAsService(db, () => db.query<{ name: string }>(`select name from organizations where id = $1`, [orgBId]));
    expect(check.rows[0]!.name).toBe("Tenant B");
  });

  it("usuário A não consegue fazer DELETE na organização B (0 linhas afetadas)", async () => {
    const result = await runAsUser(db, userAId, () =>
      db.query(`delete from organizations where id = $1 returning id`, [orgBId]),
    );
    expect(result.rows).toEqual([]);

    const check = await runAsService(db, () => db.query(`select id from organizations where id = $1`, [orgBId]));
    expect(check.rows).toHaveLength(1);
  });

  it("usuário A não consegue criar grupo dentro da organização B (INSERT lança erro de RLS)", async () => {
    await expect(
      runAsUser(db, userAId, () =>
        db.query(`insert into groups (organization_id, name) values ($1, $2)`, [orgBId, "Grupo Invasor"]),
      ),
    ).rejects.toThrow();
  });

  it("usuário A NÃO consegue ler grupos da organização B", async () => {
    const groupB = await runAsUser(db, userBId, () =>
      insertReturning<{ id: string }>(db, "groups", { organization_id: orgBId, name: "Grupo Legítimo de B" }),
    );

    const result = await runAsUser(db, userAId, () => db.query(`select id from groups where id = $1`, [groupB.id]));
    expect(result.rows).toEqual([]);
  });

  it("organização B continua intacta e visível para o usuário B", async () => {
    const result = await runAsUser(db, userBId, () =>
      db.query<{ id: string; name: string }>(`select id, name from organizations where id = $1`, [orgBId]),
    );
    expect(result.rows[0]!.name).toBe("Tenant B");
  });

  it("usuário A consegue operar normalmente nos próprios dados (UPDATE na própria organização, é super_admin)", async () => {
    const result = await runAsUser(db, userAId, () =>
      db.query<{ id: string; name: string }>(`update organizations set name = $1 where id = $2 returning id, name`, [
        "Tenant A Renomeado",
        orgAId,
      ]),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.name).toBe("Tenant A Renomeado");
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
    "[rls-tenant-isolation] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/" +
      "TEST_SUPABASE_SERVICE_ROLE_KEY/TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/" +
      "SUPABASE_SERVICE_ROLE_KEY) apontando para uma instância local do Supabase (`supabase start`) para " +
      "executar também o modo HTTP. O modo PGlite acima já cobre RLS/isolamento contra um Postgres real.",
  );
}

describe.skipIf(!hasLocalSupabase)("RLS — isolamento entre tenants (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;

  let orgAId: string;
  let orgBId: string;
  let userAEmail: string;
  let userBEmail: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    userAEmail = `rls-test-a-${suffix}@example.com`;
    userBEmail = `rls-test-b-${suffix}@example.com`;
    const password = "SenhaForte123!";

    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: userAEmail,
      password,
      email_confirm: true,
    });
    if (userAError || !userA.user) throw new Error(`Falha ao criar usuário A: ${userAError?.message}`);
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: userBEmail,
      password,
      email_confirm: true,
    });
    if (userBError || !userB.user) throw new Error(`Falha ao criar usuário B: ${userBError?.message}`);
    userBId = userB.user.id;

    userAClient = createClient(SUPABASE_URL, ANON_KEY);
    userBClient = createClient(SUPABASE_URL, ANON_KEY);

    const { error: signInAError } = await userAClient.auth.signInWithPassword({
      email: userAEmail,
      password,
    });
    if (signInAError) throw new Error(`Falha login A: ${signInAError.message}`);

    const { error: signInBError } = await userBClient.auth.signInWithPassword({
      email: userBEmail,
      password,
    });
    if (signInBError) throw new Error(`Falha login B: ${signInBError.message}`);

    const { data: orgA, error: orgAError } = await userAClient.rpc(
      "create_organization_with_owner",
      { org_name: "Tenant A", org_slug: `tenant-a-${suffix}` },
    );
    if (orgAError || !orgA) throw new Error(`Falha ao criar organização A: ${orgAError?.message}`);
    orgAId = (orgA as { id: string }).id;

    const { data: orgB, error: orgBError } = await userBClient.rpc(
      "create_organization_with_owner",
      { org_name: "Tenant B", org_slug: `tenant-b-${suffix}` },
    );
    if (orgBError || !orgB) throw new Error(`Falha ao criar organização B: ${orgBError?.message}`);
    orgBId = (orgB as { id: string }).id;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("usuário A vê a própria organização A via SELECT", async () => {
    const { data, error } = await userAClient
      .from("organizations")
      .select("id, name")
      .eq("id", orgAId)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe("Tenant A");
  });

  it("usuário A não vê a organização B via SELECT", async () => {
    const { data, error } = await userAClient
      .from("organizations")
      .select("id")
      .eq("id", orgBId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuário A não vê memberships da organização B", async () => {
    const { data, error } = await userAClient
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", orgBId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuário A não consegue fazer UPDATE na organização B", async () => {
    const { data, error } = await userAClient
      .from("organizations")
      .update({ name: "Hackeado" })
      .eq("id", orgBId)
      .select();

    // RLS bloqueia via WITH CHECK/USING: nenhuma linha é afetada (não é um
    // erro de permissão explícito do Postgres, é filtragem silenciosa —
    // por isso a asserção correta é "nenhuma linha alterada", não `error`).
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuário A não consegue fazer DELETE na organização B", async () => {
    const { data, error } = await userAClient
      .from("organizations")
      .delete()
      .eq("id", orgBId)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuário A não consegue criar grupo dentro da organização B", async () => {
    const { error } = await userAClient
      .from("groups")
      .insert({ organization_id: orgBId, name: "Grupo Invasor" });

    expect(error).not.toBeNull();
  });

  it("organização B continua intacta e visível para o usuário B", async () => {
    const { data, error } = await userBClient
      .from("organizations")
      .select("id, name")
      .eq("id", orgBId)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe("Tenant B");
  });
});

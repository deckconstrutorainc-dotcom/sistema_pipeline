// @vitest-environment node
/**
 * Teste de integração da Colaboração Externa (M5): cria organização + pipe
 * + fase inicial + campo (não obrigatório na fase) + portal público -> um
 * `portal_items` com `is_required_override: true` endurece a obrigatoriedade
 * só no formulário externo -> submete o formulário público (anon, sem
 * sessão) -> valida que card + request foram criados -> campo obrigatório
 * do portal ausente bloqueia a submissão -> consulta de status por
 * protocolo funciona sem autenticação -> portal inativo rejeita submissão ->
 * isolamento entre tenants (um usuário de outra organização não enxerga a
 * `request` pela tabela, mesmo sabendo o protocolo).
 *
 * MODO PADRÃO (roda sempre): PGlite — Postgres real (WASM), sem Docker. Ver
 * `tests/integration/setup/pglite-supabase.ts`. `submit_portal_request`,
 * `get_portal_public_config` e `get_request_status_by_protocol` são
 * SECURITY DEFINER e chamadas via `runAsAnon`, simulando fielmente o
 * visitante externo sem sessão.
 *
 * MODO OPCIONAL (só roda com as env vars abaixo): Supabase local real via
 * CLI/Docker, sobre HTTP/PostgREST.
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M5).
 *   3. Exporte as variáveis de ambiente abaixo apontando para a instância
 *      local.
 *   4. `npm run test -- portal-submission`.
 */
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsAnon, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão)
// =====================================================================
describe("Colaboração Externa — submissão pública de portal (pglite)", () => {
  let db: PGlite;

  let userId: string;
  let orgId: string;
  let pipeId: string;
  let phaseId: string;
  let requiredFieldId: string;
  let portalId: string;
  let portalSlug: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userId = await createAuthUser(db, "portal-pglite@example.com");

    const org = await runAsUser(db, userId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Portal Org",
        "portal-org-pglite",
      ]),
    );
    orgId = org.rows[0]!.id;

    const pipe = await runAsUser(db, userId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgId,
        name: "Solicitações",
        created_by: userId,
      }),
    );
    pipeId = pipe.id;

    const phase = await runAsUser(db, userId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeId,
        name: "Recebido",
        position: 0,
        is_initial: true,
      }),
    );
    phaseId = phase.id;

    const field = await runAsUser(db, userId, () =>
      insertReturning<{ id: string }>(db, "fields", {
        pipe_id: pipeId,
        label: "Descrição da solicitação",
        field_key: "descricao",
        type: "long_text",
      }),
    );
    requiredFieldId = field.id;

    // Não obrigatório na fase — a obrigatoriedade real, neste teste, vem do
    // portal_items.is_required_override abaixo.
    await runAsUser(db, userId, () =>
      db.query(`insert into phase_fields (phase_id, field_id, is_required) values ($1, $2, false)`, [
        phaseId,
        requiredFieldId,
      ]),
    );

    portalSlug = "portal-publico-pglite";
    const portal = await runAsUser(db, userId, () =>
      insertReturning<{ id: string }>(db, "portals", {
        organization_id: orgId,
        pipe_id: pipeId,
        name: "Portal de solicitações",
        slug: portalSlug,
        visibility: "public",
        created_by: userId,
      }),
    );
    portalId = portal.id;

    await runAsUser(db, userId, () =>
      db.query(
        `insert into portal_items (portal_id, field_id, position, is_required_override) values ($1, $2, 0, true)`,
        [portalId, requiredFieldId],
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("get_portal_public_config retorna a config do portal sem autenticação", async () => {
    const result = await runAsAnon(db, () =>
      db.query<{ field_id: string; is_required: boolean }>(`select * from get_portal_public_config($1)`, [
        portalSlug,
      ]),
    );
    expect(result.rows.some((r) => r.field_id === requiredFieldId && r.is_required === true)).toBe(true);
  });

  it("bloqueia a submissão quando o campo obrigatório do portal está ausente", async () => {
    await expect(
      runAsAnon(db, () =>
        db.query(`select * from submit_portal_request($1, $2::jsonb, $3, $4)`, [
          portalSlug,
          JSON.stringify({}),
          "Fulano",
          "fulano@example.com",
        ]),
      ),
    ).rejects.toThrow(/Descrição da solicitação/);
  });

  let protocol: string;

  it("submete o formulário público e cria card + request", async () => {
    const result = await runAsAnon(db, () =>
      db.query<{ card_id: string; protocol: string }>(`select * from submit_portal_request($1, $2::jsonb, $3, $4)`, [
        portalSlug,
        JSON.stringify({ [requiredFieldId]: "Preciso de um novo contrato." }),
        "Fulano de Tal",
        "fulano@example.com",
      ]),
    );
    const row = result.rows[0];
    expect(row?.card_id).toBeTruthy();
    expect(row?.protocol).toMatch(/^[A-Z0-9]+-\d{8}-\d{4,}$/);
    protocol = row!.protocol;

    // anon não lê `cards` (sem policy de SELECT para anon) — confirma via o
    // dono do pipe, autenticado.
    const cardResult = await runAsUser(db, userId, () =>
      db.query<{ pipe_id: string }>(`select pipe_id from cards where id = $1`, [row!.card_id]),
    );
    expect(cardResult.rows[0]?.pipe_id).toBe(pipeId);

    const activityResult = await runAsUser(db, userId, () =>
      db.query(`select type from card_activities where card_id = $1 and type = 'request_submitted'`, [
        row!.card_id,
      ]),
    );
    expect(activityResult.rows.length).toBeGreaterThan(0);
  });

  it("consulta de status por protocolo funciona sem autenticação e retorna só campos seguros", async () => {
    const result = await runAsAnon(db, () =>
      db.query<{ protocol: string; status: string; phase_name: string }>(
        `select * from get_request_status_by_protocol($1)`,
        [protocol],
      ),
    );
    const row = result.rows[0];
    expect(row?.protocol).toBe(protocol);
    expect(row?.status).toBe("in_progress");
    expect(row?.phase_name).toBe("Recebido");
  });

  it("protocolo inexistente não retorna nenhuma linha (sem vazar erro/dado de outro tenant)", async () => {
    const result = await runAsAnon(db, () =>
      db.query(`select * from get_request_status_by_protocol($1)`, ["INEXISTENTE-99999999-9999"]),
    );
    expect(result.rows).toEqual([]);
  });

  it("client anônimo não consegue ler a tabela requests diretamente (sem RPC)", async () => {
    // Sem policy de SELECT para `anon` em `requests` (ver
    // 20260818093600_collaboration_rls_policies.sql): RLS filtra
    // silenciosamente para zero linhas, não lança erro de permissão (a
    // tabela tem GRANT de SELECT via ALTER DEFAULT PRIVILEGES, só não tem
    // policy permissiva para este role).
    const result = await runAsAnon(db, () => db.query(`select id from requests`));
    expect(result.rows).toEqual([]);
  });

  it("portal inativo rejeita novas submissões", async () => {
    await runAsUser(db, userId, () => db.query(`update portals set is_active = false where id = $1`, [portalId]));

    await expect(
      runAsAnon(db, () =>
        db.query(`select * from submit_portal_request($1, $2::jsonb)`, [
          portalSlug,
          JSON.stringify({ [requiredFieldId]: "Outra solicitação." }),
        ]),
      ),
    ).rejects.toThrow(/não está recebendo solicitações/);

    await runAsUser(db, userId, () => db.query(`update portals set is_active = true where id = $1`, [portalId]));
  });

  it("isolamento entre tenants: usuário de outra organização não vê a request via SELECT", async () => {
    const otherUserId = await createAuthUser(db, "portal-other-pglite@example.com");
    await runAsUser(db, otherUserId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, ["Outra Org", "outra-org-pglite"]),
    );

    const result = await runAsUser(db, otherUserId, () =>
      db.query<{ id: string; protocol: string }>(`select id, protocol from requests where protocol = $1`, [
        protocol,
      ]),
    );
    expect(result.rows).toEqual([]);
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
    "[portal-submission] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/SUPABASE_SERVICE_ROLE_KEY) " +
      "apontando para uma instância local do Supabase (`supabase start`) para executar também o modo HTTP. " +
      "O modo PGlite acima já cobre a submissão pública de portal contra um Postgres real.",
  );
}

describe.skipIf(!hasLocalSupabase)("Colaboração Externa — submissão pública de portal (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let userId: string;
  let orgId: string;
  let orgSlug: string;
  let pipeId: string;
  let phaseId: string;
  let requiredFieldId: string;
  let portalId: string;
  let portalSlug: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `portal-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userError || !user.user) throw new Error(`Falha ao criar usuário: ${userError?.message}`);
    userId = user.user.id;

    userClient = createClient(SUPABASE_URL, ANON_KEY);
    await userClient.auth.signInWithPassword({ email: `portal-${suffix}@example.com`, password });

    orgSlug = `portal-org-${suffix}`;
    const { data: org } = await userClient.rpc("create_organization_with_owner", {
      org_name: "Portal Org",
      org_slug: orgSlug,
    });
    orgId = (org as { id: string }).id;

    const { data: pipe } = await userClient
      .from("pipes")
      .insert({ organization_id: orgId, name: "Solicitações", created_by: userId })
      .select("id")
      .single();
    pipeId = (pipe as { id: string }).id;

    const { data: phase } = await userClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Recebido", position: 0, is_initial: true })
      .select("id")
      .single();
    phaseId = (phase as { id: string }).id;

    const { data: field } = await userClient
      .from("fields")
      .insert({ pipe_id: pipeId, label: "Descrição da solicitação", field_key: "descricao", type: "long_text" })
      .select("id")
      .single();
    requiredFieldId = (field as { id: string }).id;

    await userClient.from("phase_fields").insert({ phase_id: phaseId, field_id: requiredFieldId, is_required: false });

    portalSlug = `portal-publico-${suffix}`;
    const { data: portal } = await userClient
      .from("portals")
      .insert({
        organization_id: orgId,
        pipe_id: pipeId,
        name: "Portal de solicitações",
        slug: portalSlug,
        visibility: "public",
        created_by: userId,
      })
      .select("id")
      .single();
    portalId = (portal as { id: string }).id;

    await userClient.from("portal_items").insert({
      portal_id: portalId,
      field_id: requiredFieldId,
      position: 0,
      is_required_override: true, // endurece: obrigatório no portal mesmo não sendo obrigatório na fase
    });

    // Client verdadeiramente anônimo, sem sessão — simula o visitante externo.
    anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("get_portal_public_config retorna a config do portal sem autenticação", async () => {
    const { data, error } = await anonClient.rpc("get_portal_public_config", { p_slug: portalSlug });
    expect(error).toBeNull();
    const rows = (data ?? []) as { field_id: string; is_required: boolean }[];
    expect(rows.some((r) => r.field_id === requiredFieldId && r.is_required === true)).toBe(true);
  });

  it("bloqueia a submissão quando o campo obrigatório do portal está ausente", async () => {
    const { error } = await anonClient.rpc("submit_portal_request", {
      p_portal_slug: portalSlug,
      p_field_values: {},
      p_requester_name: "Fulano",
      p_requester_email: "fulano@example.com",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Descrição da solicitação");
  });

  let protocol: string;

  it("submete o formulário público e cria card + request", async () => {
    const { data, error } = await anonClient.rpc("submit_portal_request", {
      p_portal_slug: portalSlug,
      p_field_values: { [requiredFieldId]: "Preciso de um novo contrato." },
      p_requester_name: "Fulano de Tal",
      p_requester_email: "fulano@example.com",
    });
    expect(error).toBeNull();
    const [row] = (data ?? []) as { card_id: string; protocol: string }[];
    expect(row?.card_id).toBeTruthy();
    expect(row?.protocol).toMatch(/^[A-Z0-9]+-\d{8}-\d{4,}$/);
    protocol = row!.protocol;

    const { data: card } = await userClient.from("cards").select("id, pipe_id").eq("id", row!.card_id).single();
    expect((card as { pipe_id: string }).pipe_id).toBe(pipeId);

    const { data: activity } = await userClient
      .from("card_activities")
      .select("type")
      .eq("card_id", row!.card_id)
      .eq("type", "request_submitted");
    expect((activity ?? []).length).toBeGreaterThan(0);
  });

  it("consulta de status por protocolo funciona sem autenticação e retorna só campos seguros", async () => {
    const { data, error } = await anonClient.rpc("get_request_status_by_protocol", { p_protocol: protocol });
    expect(error).toBeNull();
    const [row] = (data ?? []) as { protocol: string; status: string; phase_name: string }[];
    expect(row?.protocol).toBe(protocol);
    expect(row?.status).toBe("in_progress");
    expect(row?.phase_name).toBe("Recebido");
  });

  it("protocolo inexistente não retorna nenhuma linha (sem vazar erro/dado de outro tenant)", async () => {
    const { data, error } = await anonClient.rpc("get_request_status_by_protocol", {
      p_protocol: "INEXISTENTE-99999999-9999",
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("client anônimo não consegue ler a tabela requests diretamente (sem RPC)", async () => {
    const { data, error } = await anonClient.from("requests").select("id");
    // RLS não libera SELECT para anon nesta tabela: ou vem vazio, ou erro de policy.
    expect((data ?? []).length === 0 || error !== null).toBe(true);
  });

  it("portal inativo rejeita novas submissões", async () => {
    await userClient.from("portals").update({ is_active: false }).eq("id", portalId);

    const { error } = await anonClient.rpc("submit_portal_request", {
      p_portal_slug: portalSlug,
      p_field_values: { [requiredFieldId]: "Outra solicitação." },
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("não está recebendo solicitações");

    await userClient.from("portals").update({ is_active: true }).eq("id", portalId);
  });

  it("isolamento entre tenants: usuário de outra organização não vê a request via SELECT", async () => {
    const suffix = Date.now();
    const password = "SenhaForte123!";
    const { data: otherUser } = await admin.auth.admin.createUser({
      email: `portal-other-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    const otherUserId = otherUser?.user?.id;

    const otherClient = createClient(SUPABASE_URL, ANON_KEY);
    await otherClient.auth.signInWithPassword({ email: `portal-other-${suffix}@example.com`, password });
    await otherClient.rpc("create_organization_with_owner", {
      org_name: "Outra Org",
      org_slug: `outra-org-${suffix}`,
    });

    const { data } = await otherClient.from("requests").select("id, protocol").eq("protocol", protocol);
    expect(data ?? []).toEqual([]);

    if (otherUserId) await admin.auth.admin.deleteUser(otherUserId);
  });
});

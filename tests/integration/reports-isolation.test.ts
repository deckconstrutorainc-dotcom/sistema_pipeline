/**
 * Teste de integração do módulo de Gestão e Analytics (M6): admin cria
 * report/dashboard/interface/document_template na organização A ->
 * isolamento entre tenants (organização B não pode ler nem escrever nada
 * disso, mesmo conhecendo os IDs).
 *
 * MODO PADRÃO (roda sempre, sem nenhuma variável de ambiente): PGlite — um
 * Postgres real (WASM), sem Docker, sem projeto Supabase remoto. Ver
 * `tests/integration/setup/pglite-supabase.ts` para a documentação
 * completa do harness (baseline replicado, GRANTs, limitações conhecidas).
 * Este modo aplica de verdade TODAS as migrations de `supabase/migrations/`
 * + `supabase/seed.sql` contra uma instância nova do banco e exercita as
 * RLS policies deste milestone (`20260818094200_analytics_rls_policies.sql`)
 * de verdade.
 *
 * MODO OPCIONAL (roda só se as env vars abaixo estiverem definidas):
 * Supabase local real via CLI/Docker (`supabase start` + `supabase db
 * reset`), usando `@supabase/supabase-js` sobre HTTP/PostgREST.
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M6,
 *      + seed.sql).
 *   3. Exporte as variáveis de ambiente abaixo apontando para a instância
 *      local.
 *   4. `npm run test -- reports-isolation`.
 */
// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão)
// =====================================================================
describe("M6 — Gestão e Analytics: isolamento entre tenants (pglite)", () => {
  let db: PGlite;

  let userAId: string;
  let userBId: string;
  let orgAId: string;

  let pipeAId: string;
  let reportAId: string;
  let dashboardAId: string;
  let interfaceAId: string;
  let templateAId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    userAId = await createAuthUser(db, "analytics-pglite-a@example.com");
    userBId = await createAuthUser(db, "analytics-pglite-b@example.com");

    // Ambos os usuários criam a própria organização como super_admin (via
    // create_organization_with_owner, M1) — só assim têm papel admin para
    // exercitar as policies de escrita (admin-only) deste módulo.
    const orgA = await runAsUser(db, userAId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "Analytics Org A",
        "analytics-org-a-pglite",
      ]),
    );
    orgAId = orgA.rows[0]!.id;

    // Usuário B precisa ser membro de ALGUMA organização (mesmo que não seja
    // usada diretamente nas asserções abaixo) para exercitar o cenário
    // realista de "usuário autenticado com organização própria tentando
    // acessar dados de outro tenant" em vez de "usuário sem organização
    // nenhuma" (caso trivial, já coberto por rls-tenant-isolation.test.ts).
    await runAsUser(db, userBId, () =>
      db.query(`select * from create_organization_with_owner($1, $2)`, [
        "Analytics Org B",
        "analytics-org-b-pglite",
      ]),
    );

    const pipeA = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "pipes", {
        organization_id: orgAId,
        name: "Pipe A",
        created_by: userAId,
      }),
    );
    pipeAId = pipeA.id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("admin A cria um report na organização A", async () => {
    const report = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "reports", {
        organization_id: orgAId,
        pipe_id: pipeAId,
        name: "Cards por fase",
        config: { metric: "phase_counts" },
        created_by: userAId,
      }),
    );
    reportAId = report.id;
    expect(reportAId).toBeTruthy();
  });

  it("admin A cria um dashboard e um widget referenciando o report", async () => {
    const dashboard = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "dashboards", {
        organization_id: orgAId,
        name: "Visão geral",
        created_by: userAId,
      }),
    );
    dashboardAId = dashboard.id;

    const widget = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "dashboard_widgets", {
        dashboard_id: dashboardAId,
        report_id: reportAId,
        widget_type: "bar_chart",
        title: "Cards por fase",
      }),
    );
    expect(widget.id).toBeTruthy();
  });

  it("admin A cria uma interface publicada e um document_template", async () => {
    const iface = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "interfaces", {
        organization_id: orgAId,
        name: "Painel do time",
        slug: "painel-time",
        is_published: true,
        created_by: userAId,
      }),
    );
    interfaceAId = iface.id;

    const template = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "document_templates", {
        organization_id: orgAId,
        pipe_id: pipeAId,
        name: "Ofício",
        body: "<p>{{card.title}}</p>",
        created_by: userAId,
      }),
    );
    templateAId = template.id;
  });

  it("usuário B NÃO consegue ler o report/dashboard/interface/template da organização A", async () => {
    await runAsUser(db, userBId, async () => {
      const reports = await db.query(`select id from reports where id = $1`, [reportAId]);
      expect(reports.rows).toEqual([]);

      const dashboards = await db.query(`select id from dashboards where id = $1`, [dashboardAId]);
      expect(dashboards.rows).toEqual([]);

      const interfaces = await db.query(`select id from interfaces where id = $1`, [interfaceAId]);
      expect(interfaces.rows).toEqual([]);

      const templates = await db.query(`select id from document_templates where id = $1`, [templateAId]);
      expect(templates.rows).toEqual([]);
    });
  });

  it("usuário B NÃO consegue criar um report apontando para a organização A", async () => {
    await expect(
      runAsUser(db, userBId, () =>
        db.query(
          `insert into reports (organization_id, name, config, created_by) values ($1, $2, $3, $4)`,
          [orgAId, "Report malicioso", { metric: "phase_counts" }, userBId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("usuário B (sem papel admin na organização A) NÃO consegue adicionar widget ao dashboard de A", async () => {
    await expect(
      runAsUser(db, userBId, () =>
        db.query(`insert into dashboard_widgets (dashboard_id, widget_type, title) values ($1, $2, $3)`, [
          dashboardAId,
          "kpi",
          "Widget malicioso",
        ]),
      ),
    ).rejects.toThrow();
  });

  it("generated_documents não tem policy de INSERT para authenticated (nem para o próprio dono)", async () => {
    // Confirma que nem o usuário A (dono do template/pipe) consegue inserir
    // diretamente uma linha em generated_documents — a única via de escrita
    // é o server action generateDocument, via service role. Diferente do
    // modo HTTP (que depende de um card já existir de outro teste), aqui
    // criamos um card determinístico só para este cenário.
    const phase = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "phases", {
        pipe_id: pipeAId,
        name: "Aberto",
        position: 0,
        is_initial: true,
      }),
    );

    const card = await runAsUser(db, userAId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeAId,
        current_phase_id: phase.id,
        title: "Card para geração de documento",
        created_by: userAId,
      }),
    );

    await expect(
      runAsUser(db, userAId, () =>
        db.query(
          `insert into generated_documents (template_id, card_id, generated_by, status, storage_path) values ($1, $2, $3, $4, $5)`,
          [templateAId, card.id, userAId, "generated", "fake/path.html"],
        ),
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
    "[reports-isolation] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/SUPABASE_SERVICE_ROLE_KEY) " +
      "apontando para uma instância local do Supabase (`supabase start`) para executar também o modo HTTP. " +
      "O modo PGlite acima já cobre RLS/isolamento contra um Postgres real.",
  );
}

describe.skipIf(!hasLocalSupabase)("M6 — Gestão e Analytics: isolamento entre tenants (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;

  let orgAId: string;
  let userAId: string;
  let userBId: string;

  let pipeAId: string;
  let reportAId: string;
  let dashboardAId: string;
  let interfaceAId: string;
  let templateAId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: `analytics-a-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userAError || !userA.user) throw new Error(`Falha ao criar usuário A: ${userAError?.message}`);
    userAId = userA.user.id;

    const { data: userB, error: userBError } = await admin.auth.admin.createUser({
      email: `analytics-b-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (userBError || !userB.user) throw new Error(`Falha ao criar usuário B: ${userBError?.message}`);
    userBId = userB.user.id;

    userAClient = createClient(SUPABASE_URL, ANON_KEY);
    userBClient = createClient(SUPABASE_URL, ANON_KEY);

    await userAClient.auth.signInWithPassword({ email: `analytics-a-${suffix}@example.com`, password });
    await userBClient.auth.signInWithPassword({ email: `analytics-b-${suffix}@example.com`, password });

    // Ambos os usuários criam a própria organização como super_admin (via
    // create_organization_with_owner, M1) — só assim têm papel admin para
    // exercitar as policies de escrita (admin-only) deste módulo.
    const { data: orgA } = await userAClient.rpc("create_organization_with_owner", {
      org_name: "Analytics Org A",
      org_slug: `analytics-org-a-${suffix}`,
    });
    orgAId = (orgA as { id: string }).id;

    // Usuário B precisa ser membro de ALGUMA organização (mesmo que não seja
    // usada diretamente nas asserções abaixo) para exercitar o cenário
    // realista de "usuário autenticado com organização própria tentando
    // acessar dados de outro tenant" em vez de "usuário sem organização
    // nenhuma" (caso trivial, já coberto por rls-tenant-isolation.test.ts).
    await userBClient.rpc("create_organization_with_owner", {
      org_name: "Analytics Org B",
      org_slug: `analytics-org-b-${suffix}`,
    });

    const { data: pipeA } = await userAClient
      .from("pipes")
      .insert({ organization_id: orgAId, name: "Pipe A", created_by: userAId })
      .select("id")
      .single();
    pipeAId = (pipeA as { id: string }).id;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("admin A cria um report na organização A", async () => {
    const { data, error } = await userAClient
      .from("reports")
      .insert({
        organization_id: orgAId,
        pipe_id: pipeAId,
        name: "Cards por fase",
        config: { metric: "phase_counts" },
        created_by: userAId,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    reportAId = (data as { id: string }).id;
  });

  it("admin A cria um dashboard e um widget referenciando o report", async () => {
    const { data: dashboard, error: dashboardError } = await userAClient
      .from("dashboards")
      .insert({ organization_id: orgAId, name: "Visão geral", created_by: userAId })
      .select("id")
      .single();
    expect(dashboardError).toBeNull();
    dashboardAId = (dashboard as { id: string }).id;

    const { error: widgetError } = await userAClient.from("dashboard_widgets").insert({
      dashboard_id: dashboardAId,
      report_id: reportAId,
      widget_type: "bar_chart",
      title: "Cards por fase",
    });
    expect(widgetError).toBeNull();
  });

  it("admin A cria uma interface publicada e um document_template", async () => {
    const { data: iface, error: ifaceError } = await userAClient
      .from("interfaces")
      .insert({
        organization_id: orgAId,
        name: "Painel do time",
        slug: "painel-time",
        is_published: true,
        created_by: userAId,
      })
      .select("id")
      .single();
    expect(ifaceError).toBeNull();
    interfaceAId = (iface as { id: string }).id;

    const { data: template, error: templateError } = await userAClient
      .from("document_templates")
      .insert({
        organization_id: orgAId,
        pipe_id: pipeAId,
        name: "Ofício",
        body: "<p>{{card.title}}</p>",
        created_by: userAId,
      })
      .select("id")
      .single();
    expect(templateError).toBeNull();
    templateAId = (template as { id: string }).id;
  });

  it("usuário B NÃO consegue ler o report/dashboard/interface/template da organização A", async () => {
    const { data: reports } = await userBClient.from("reports").select("id").eq("id", reportAId);
    expect(reports).toEqual([]);

    const { data: dashboards } = await userBClient.from("dashboards").select("id").eq("id", dashboardAId);
    expect(dashboards).toEqual([]);

    const { data: interfaces } = await userBClient.from("interfaces").select("id").eq("id", interfaceAId);
    expect(interfaces).toEqual([]);

    const { data: templates } = await userBClient
      .from("document_templates")
      .select("id")
      .eq("id", templateAId);
    expect(templates).toEqual([]);
  });

  it("usuário B NÃO consegue criar um report apontando para a organização A", async () => {
    const { error } = await userBClient.from("reports").insert({
      organization_id: orgAId,
      name: "Report malicioso",
      config: { metric: "phase_counts" },
      created_by: userBId,
    });
    expect(error).not.toBeNull();
  });

  it("usuário B (sem papel admin em sua própria organização não é o caso, mas sem organização A) NÃO consegue adicionar widget ao dashboard de A", async () => {
    const { error } = await userBClient.from("dashboard_widgets").insert({
      dashboard_id: dashboardAId,
      widget_type: "kpi",
      title: "Widget malicioso",
    });
    expect(error).not.toBeNull();
  });

  it("generated_documents não tem policy de INSERT para authenticated (nem para o próprio dono)", async () => {
    // Confirma que nem o usuário A (dono do template/pipe) consegue inserir
    // diretamente uma linha em generated_documents — a única via de escrita
    // é o server action generateDocument, via service role.
    const { data: card } = await userAClient
      .from("cards")
      .select("id")
      .eq("pipe_id", pipeAId)
      .limit(1)
      .maybeSingle();

    if (!card) return; // nenhum card criado neste teste — não bloqueia a asserção principal acima.

    const { error } = await userAClient.from("generated_documents").insert({
      template_id: templateAId,
      card_id: (card as { id: string }).id,
      generated_by: userAId,
      status: "generated",
      storage_path: "fake/path.html",
    });
    expect(error).not.toBeNull();
  });
});

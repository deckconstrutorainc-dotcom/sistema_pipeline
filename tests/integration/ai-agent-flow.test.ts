/**
 * Teste de integração da camada de Intelligence (M8): criar agente com
 * allowed_tools restrita -> disparar ai_run manual -> tool fora da
 * allowlist é rejeitada (nunca executada) -> tool crítica com
 * requires_approval=true gera status 'awaiting_approval' (nada executado
 * ainda) -> `approve_ai_run` só funciona para admin/super_admin da
 * organização (membro comum é rejeitado) -> após aprovação, a run é
 * retomada e a tool crítica é executada -> isolamento entre tenants
 * (agente/run de uma organização nunca é acessível/aprovável por membro de
 * outra) -> `ai_runs`/`ai_run_evidences` nunca aceitam INSERT/UPDATE direto
 * do client autenticado (nem admin), só leitura.
 *
 * MODO PADRÃO (roda sempre, sem nenhuma variável de ambiente): PGlite — um
 * Postgres real (WASM), sem Docker, sem projeto Supabase remoto. Ver
 * `tests/integration/setup/pglite-supabase.ts` para a documentação completa
 * do harness (baseline replicado, GRANTs, limitações conhecidas). Este modo
 * NÃO chama `processAiRun`/o provider de IA real (evita custo de API em CI,
 * e o client `@supabase/supabase-js` usado por `ai-run-processor.ts` fala
 * HTTP/PostgREST — inexistente na frente do PGlite) — ele testa o CONTORNO
 * controlado pelo banco (RLS, allowlist gravada, trigger de enfileiramento,
 * RPC `approve_ai_run`), inserindo `tool_calls` manualmente para simular o
 * que `ai-run-processor.ts` gravaria. A lógica de decisão determinística
 * (`decideToolCallOutcome`) já é coberta por `tests/unit/ai-run-processor.test.ts`.
 *
 * MODO OPCIONAL (roda só se as env vars abaixo estiverem definidas):
 * Supabase local real via CLI/Docker (`supabase start` + `supabase db
 * reset`), usando `@supabase/supabase-js` sobre HTTP/PostgREST — mesma
 * cobertura de RLS/RPC do modo PGlite, mas contra PostgREST/GoTrue reais.
 *
 * Para rodar o modo HTTP:
 *   1. `supabase start` (requer Docker + Supabase CLI instalados).
 *   2. `supabase db reset` (aplica todas as migrations, incluindo as de M8).
 *   3. Exporte as variáveis de ambiente abaixo apontando para a instância
 *      local.
 *   4. `npm run test -- ai-agent-flow`.
 */
// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthUser, createTestDatabase, insertReturning, runAsService, runAsUser } from "./setup/pglite-supabase";

// =====================================================================
// MODO PGlite (padrão)
// =====================================================================
describe("Intelligence — allowlist, human-in-the-loop, isolamento entre tenants (pglite)", () => {
  let db: PGlite;

  let adminUserId: string;
  let memberUserId: string;
  let otherAdminUserId: string;
  let orgId: string;
  let otherOrgId: string;
  let pipeId: string;
  let phaseOpenId: string;
  let fieldId: string;
  let agentId: string;
  let pendingRunId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    adminUserId = await createAuthUser(db, "ai-pglite-admin@example.com");
    memberUserId = await createAuthUser(db, "ai-pglite-member@example.com");
    otherAdminUserId = await createAuthUser(db, "ai-pglite-other-admin@example.com");

    const org = await runAsUser(db, adminUserId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, ["AI Org", "ai-org-pglite"]),
    );
    orgId = org.rows[0]!.id;

    // Organização de outro tenant, com seu próprio admin (super_admin por
    // ser quem a criou) — usada só para o teste de isolamento entre
    // tenants.
    const otherOrg = await runAsUser(db, otherAdminUserId, () =>
      db.query<{ id: string }>(`select * from create_organization_with_owner($1, $2)`, [
        "AI Org (outro tenant)",
        "ai-org-other-pglite",
      ]),
    );
    otherOrgId = otherOrg.rows[0]!.id;

    // memberUser entra em orgId com papel 'member' (não-admin) — inserido
    // diretamente via service_role, contornando o fluxo de convite completo
    // (fora de escopo deste teste), igual ao modo HTTP abaixo.
    const memberRole = await runAsService(db, () =>
      db.query<{ id: string }>(`select id from roles where key = 'member'`),
    );
    const memberRoleId = memberRole.rows[0]!.id;
    await runAsService(db, () =>
      insertReturning(db, "organization_memberships", {
        organization_id: orgId,
        user_id: memberUserId,
        role_id: memberRoleId,
        status: "active",
        invited_by: adminUserId,
      }),
    );

    const pipe = await runAsUser(db, adminUserId, () =>
      insertReturning<{ id: string }>(db, "pipes", { organization_id: orgId, name: "Pipe IA", created_by: adminUserId }),
    );
    pipeId = pipe.id;

    const openPhase = await runAsUser(db, adminUserId, () =>
      insertReturning<{ id: string }>(db, "phases", { pipe_id: pipeId, name: "Aberto", position: 0, is_initial: true }),
    );
    phaseOpenId = openPhase.id;

    const field = await runAsUser(db, adminUserId, () =>
      insertReturning<{ id: string }>(db, "fields", {
        pipe_id: pipeId,
        label: "Valor do contrato",
        field_key: "valor_contrato",
        type: "currency",
      }),
    );
    fieldId = field.id;

    const agent = await runAsUser(db, adminUserId, () =>
      insertReturning<{ id: string }>(db, "ai_agents", {
        organization_id: orgId,
        name: "Assistente de Contratos",
        instructions: "Você resume cards de contratos.",
        allowed_tools: ["summarize_card", "extract_card_fields_from_document"],
        requires_approval: true,
        created_by: adminUserId,
      }),
    );
    agentId = agent.id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("cria um agente com allowlist restrita e o registro NÃO permite tools fora da lista", async () => {
    const result = await runAsUser(db, adminUserId, () =>
      db.query<{ allowed_tools: string[] }>(`select allowed_tools from ai_agents where id = $1`, [agentId]),
    );
    expect(result.rows[0]!.allowed_tools).toEqual(["summarize_card", "extract_card_fields_from_document"]);
    expect(result.rows[0]!.allowed_tools).not.toContain("update_card_field");
  });

  it("disparar um ai_run manual enfileira automaticamente um job job_type='ai_run' (trigger enqueue_ai_run_job)", async () => {
    const card = await runAsUser(db, adminUserId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeId,
        current_phase_id: phaseOpenId,
        title: "Contrato ACME",
        created_by: adminUserId,
      }),
    );

    const run = await runAsService(db, () =>
      insertReturning<{ id: string }>(db, "ai_runs", {
        ai_agent_id: agentId,
        organization_id: orgId,
        trigger_type: "manual",
        card_id: card.id,
        input: { instruction: "Resuma este card." },
        status: "pending",
        requested_by: adminUserId,
      }),
    );

    const job = await runAsService(db, () =>
      db.query<{ id: string; job_type: string; payload: { ai_run_id: string } }>(
        `select id, job_type, payload from jobs where job_type = 'ai_run' and payload @> $1::jsonb`,
        [JSON.stringify({ ai_run_id: run.id })],
      ),
    );
    expect(job.rows.length).toBeGreaterThan(0);
  });

  it("uma tool crítica com requires_approval=true fica 'awaiting_approval' — evidência de que nada foi executado ainda", async () => {
    const card = await runAsUser(db, adminUserId, () =>
      insertReturning<{ id: string }>(db, "cards", {
        pipe_id: pipeId,
        current_phase_id: phaseOpenId,
        title: "Contrato Beta",
        created_by: adminUserId,
      }),
    );

    // Simula o que ai-run-processor.ts gravaria ao decidir reter uma tool
    // 'critical' para aprovação — sem chamar o provider real (ver
    // comentário no topo do arquivo).
    const run = await runAsService(db, () =>
      insertReturning<{ id: string }>(db, "ai_runs", {
        ai_agent_id: agentId,
        organization_id: orgId,
        trigger_type: "manual",
        card_id: card.id,
        input: { instruction: "Extraia o valor do contrato." },
        status: "awaiting_approval",
        requested_by: adminUserId,
        tool_calls: [
          {
            id: "toolu_1",
            name: "extract_card_fields_from_document",
            input: {
              cardId: card.id,
              extractions: [{ fieldId, value: 50000, sourceExcerpt: "Valor total: R$ 50.000" }],
            },
            status: "awaiting_approval",
          },
        ],
      }),
    );

    const fieldValueBefore = await runAsService(db, () =>
      db.query(`select value from card_field_values where card_id = $1 and field_id = $2`, [card.id, fieldId]),
    );
    expect(fieldValueBefore.rows).toEqual([]);

    pendingRunId = run.id;
  });

  it("approve_ai_run só funciona para admin/super_admin — membro comum é rejeitado", async () => {
    await expect(
      runAsUser(db, memberUserId, () => db.query(`select * from approve_ai_run($1, $2)`, [pendingRunId, true])),
    ).rejects.toThrow(/permissão/);

    const run = await runAsService(db, () =>
      db.query<{ status: string }>(`select status from ai_runs where id = $1`, [pendingRunId]),
    );
    expect(run.rows[0]!.status).toBe("awaiting_approval");
  });

  it("approve_ai_run aprovado por admin muda o status para 'approved' e enfileira um novo job", async () => {
    const approved = await runAsUser(db, adminUserId, () =>
      db.query<{ id: string; status: string }>(`select * from approve_ai_run($1, $2)`, [pendingRunId, true]),
    );
    expect(approved.rows[0]!.status).toBe("approved");

    const job = await runAsService(db, () =>
      db.query<{ id: string }>(`select id from jobs where job_type = 'ai_run' and payload @> $1::jsonb`, [
        JSON.stringify({ ai_run_id: pendingRunId }),
      ]),
    );
    expect(job.rows.length).toBeGreaterThan(0);
  });

  it("approve_ai_run rejeita uma run que não está mais em 'awaiting_approval' (já 'approved')", async () => {
    await expect(
      runAsUser(db, adminUserId, () => db.query(`select * from approve_ai_run($1, $2)`, [pendingRunId, true])),
    ).rejects.toThrow(/não está aguardando aprovação/);
  });

  it("isolamento entre tenants: admin de outra organização não consegue aprovar uma run que não é sua", async () => {
    // otherAdminUserId é super_admin de otherOrgId (criou a organização em
    // beforeAll), mas não é membro de orgId — approve_ai_run deve rejeitar.
    await expect(
      runAsUser(db, otherAdminUserId, () => db.query(`select * from approve_ai_run($1, $2)`, [pendingRunId, false])),
    ).rejects.toThrow(/permissão/);

    const run = await runAsService(db, () =>
      db.query<{ status: string }>(`select status from ai_runs where id = $1`, [pendingRunId]),
    );
    expect(run.rows[0]!.status).toBe("approved");
  });

  it("ai_runs/ai_run_evidences nunca aceitam INSERT/UPDATE direto do client autenticado (nem admin da organização)", async () => {
    await expect(
      runAsUser(db, adminUserId, () =>
        db.query(
          `insert into ai_runs (ai_agent_id, organization_id, trigger_type, input, status) values ($1, $2, $3, $4::jsonb, $5)`,
          [agentId, orgId, "manual", JSON.stringify({}), "succeeded"],
        ),
      ),
    ).rejects.toThrow();

    // Nenhuma policy de UPDATE: RLS filtra silenciosamente (0 linhas
    // afetadas), não lança erro — mesmo comportamento de organizations no
    // teste de RLS (rls-tenant-isolation.test.ts).
    await runAsUser(db, adminUserId, () =>
      db.query(`update ai_runs set status = 'succeeded' where id = $1`, [pendingRunId]),
    );
    const run = await runAsService(db, () =>
      db.query<{ status: string }>(`select status from ai_runs where id = $1`, [pendingRunId]),
    );
    expect(run.rows[0]!.status).toBe("approved");

    await expect(
      runAsUser(db, adminUserId, () =>
        db.query(`insert into ai_run_evidences (ai_run_id, source_excerpt) values ($1, $2)`, [
          pendingRunId,
          "tentativa de forjar evidência",
        ]),
      ),
    ).rejects.toThrow();
  });

  it("qualquer membro ativo da organização consegue LER ai_runs (observabilidade/auditoria)", async () => {
    const result = await runAsUser(db, memberUserId, () =>
      db.query(`select id from ai_runs where id = $1`, [pendingRunId]),
    );
    expect(result.rows).toHaveLength(1);
  });

  it("membro de outra organização não consegue ler ai_runs deste tenant", async () => {
    // memberUserId pertence a orgId, não a otherOrgId — usado aqui só para
    // reforçar que a leitura é por organização, não global.
    const result = await runAsUser(db, memberUserId, () =>
      db.query(`select id from ai_runs where organization_id = $1`, [otherOrgId]),
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
    "[ai-agent-flow] Modo HTTP PULADO (opcional): defina TEST_SUPABASE_URL/TEST_SUPABASE_SERVICE_ROLE_KEY/" +
      "TEST_SUPABASE_ANON_KEY (ou as variáveis NEXT_PUBLIC_SUPABASE_*/SUPABASE_SERVICE_ROLE_KEY) " +
      "apontando para uma instância local do Supabase (`supabase start`) para executar também o modo HTTP. " +
      "O modo PGlite acima já cobre RLS/allowlist/human-in-the-loop contra um Postgres real.",
  );
} else {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;
}

describe.skipIf(!hasLocalSupabase)("Intelligence — allowlist, human-in-the-loop, isolamento entre tenants (HTTP/Supabase local)", () => {
  let admin: SupabaseClient;
  let adminUserClient: SupabaseClient;
  let memberUserClient: SupabaseClient;
  let adminUserId: string;
  let memberUserId: string;
  let orgId: string;
  let otherOrgId: string;
  let pipeId: string;
  let phaseOpenId: string;
  let fieldId: string;
  let agentId: string;
  let pendingRunId = "";
  let pendingCardId = "";

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const suffix = Date.now();
    const password = "SenhaForte123!";

    const { data: adminUser, error: adminUserError } = await admin.auth.admin.createUser({
      email: `ai-admin-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (adminUserError || !adminUser.user) throw new Error(`Falha ao criar usuário admin: ${adminUserError?.message}`);
    adminUserId = adminUser.user.id;

    const { data: memberUser, error: memberUserError } = await admin.auth.admin.createUser({
      email: `ai-member-${suffix}@example.com`,
      password,
      email_confirm: true,
    });
    if (memberUserError || !memberUser.user) throw new Error(`Falha ao criar usuário membro: ${memberUserError?.message}`);
    memberUserId = memberUser.user.id;

    adminUserClient = createClient(SUPABASE_URL, ANON_KEY);
    await adminUserClient.auth.signInWithPassword({ email: `ai-admin-${suffix}@example.com`, password });

    const { data: org } = await adminUserClient.rpc("create_organization_with_owner", {
      org_name: "AI Org",
      org_slug: `ai-org-${suffix}`,
    });
    orgId = (org as { id: string }).id;

    const { data: otherOrg } = await adminUserClient.rpc("create_organization_with_owner", {
      org_name: "AI Org (outro tenant)",
      org_slug: `ai-org-other-${suffix}`,
    });
    otherOrgId = (otherOrg as { id: string }).id;

    // memberUser entra na organização com papel 'member' (não-admin) — via
    // client admin, contornando o fluxo de convite completo (fora de escopo
    // deste teste).
    const { data: memberRole } = await admin.from("roles").select("id").eq("key", "member").single();
    await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: memberUserId,
      role_id: (memberRole as { id: string }).id,
      status: "active",
      invited_by: adminUserId,
    });

    memberUserClient = createClient(SUPABASE_URL, ANON_KEY);
    await memberUserClient.auth.signInWithPassword({ email: `ai-member-${suffix}@example.com`, password });

    const { data: pipe } = await adminUserClient
      .from("pipes")
      .insert({ organization_id: orgId, name: "Pipe IA", created_by: adminUserId })
      .select("id")
      .single();
    pipeId = (pipe as { id: string }).id;

    const { data: openPhase } = await adminUserClient
      .from("phases")
      .insert({ pipe_id: pipeId, name: "Aberto", position: 0, is_initial: true })
      .select("id")
      .single();
    phaseOpenId = (openPhase as { id: string }).id;

    const { data: field } = await adminUserClient
      .from("fields")
      .insert({ pipe_id: pipeId, label: "Valor do contrato", field_key: "valor_contrato", type: "currency" })
      .select("id")
      .single();
    fieldId = (field as { id: string }).id;

    const { data: agent } = await adminUserClient
      .from("ai_agents")
      .insert({
        organization_id: orgId,
        name: "Assistente de Contratos",
        instructions: "Você resume cards de contratos.",
        allowed_tools: ["summarize_card", "extract_card_fields_from_document"],
        requires_approval: true,
        created_by: adminUserId,
      })
      .select("id")
      .single();
    agentId = (agent as { id: string }).id;
  });

  afterAll(async () => {
    if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
    if (memberUserId) await admin.auth.admin.deleteUser(memberUserId);
  });

  it("cria um agente com allowlist restrita e o registro NÃO permite tools fora da lista", async () => {
    const { data: agent } = await admin.from("ai_agents").select("allowed_tools").eq("id", agentId).single();
    expect((agent as { allowed_tools: string[] }).allowed_tools).toEqual([
      "summarize_card",
      "extract_card_fields_from_document",
    ]);
    expect((agent as { allowed_tools: string[] }).allowed_tools).not.toContain("update_card_field");
  });

  it("disparar um ai_run manual enfileira automaticamente um job job_type='ai_run' (trigger enqueue_ai_run_job)", async () => {
    const { data: card } = await adminUserClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Contrato ACME", created_by: adminUserId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    const { data: run } = await admin
      .from("ai_runs")
      .insert({
        ai_agent_id: agentId,
        organization_id: orgId,
        trigger_type: "manual",
        card_id: cardId,
        input: { instruction: "Resuma este card." },
        status: "pending",
        requested_by: adminUserId,
      })
      .select("id")
      .single();
    const runId = (run as { id: string }).id;

    const { data: job } = await admin
      .from("jobs")
      .select("id, job_type, payload")
      .eq("job_type", "ai_run")
      .contains("payload", { ai_run_id: runId })
      .maybeSingle();

    expect(job).not.toBeNull();
  });

  it("uma tool crítica com requires_approval=true fica 'awaiting_approval' — evidência de que nada foi executado ainda", async () => {
    const { data: card } = await adminUserClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Contrato Beta", created_by: adminUserId })
      .select("id")
      .single();
    const cardId = (card as { id: string }).id;

    // Simula o que ai-run-processor.ts gravaria ao decidir reter uma tool
    // 'critical' para aprovação — sem chamar o provider real (ver
    // comentário no topo do arquivo).
    const { data: run } = await admin
      .from("ai_runs")
      .insert({
        ai_agent_id: agentId,
        organization_id: orgId,
        trigger_type: "manual",
        card_id: cardId,
        input: { instruction: "Extraia o valor do contrato." },
        status: "awaiting_approval",
        requested_by: adminUserId,
        tool_calls: [
          {
            id: "toolu_1",
            name: "extract_card_fields_from_document",
            input: {
              cardId,
              extractions: [{ fieldId, value: 50000, sourceExcerpt: "Valor total: R$ 50.000" }],
            },
            status: "awaiting_approval",
          },
        ],
      })
      .select("id")
      .single();
    const runId = (run as { id: string }).id;

    const { data: fieldValueBefore } = await admin
      .from("card_field_values")
      .select("value")
      .eq("card_id", cardId)
      .eq("field_id", fieldId)
      .maybeSingle();
    expect(fieldValueBefore).toBeNull();

    pendingRunId = runId;
    pendingCardId = cardId;
  });

  it("approve_ai_run só funciona para admin/super_admin — membro comum é rejeitado", async () => {
    const { error } = await memberUserClient.rpc("approve_ai_run", { p_run_id: pendingRunId, p_approve: true });
    expect(error).not.toBeNull();

    const { data: run } = await admin.from("ai_runs").select("status").eq("id", pendingRunId).single();
    expect((run as { status: string }).status).toBe("awaiting_approval");
  });

  it("approve_ai_run aprovado por admin muda o status para 'approved' e enfileira um novo job", async () => {
    const { data: approvedRun, error } = await adminUserClient.rpc("approve_ai_run", {
      p_run_id: pendingRunId,
      p_approve: true,
    });
    expect(error).toBeNull();
    expect((approvedRun as { status: string }).status).toBe("approved");

    const { data: job } = await admin
      .from("jobs")
      .select("id")
      .eq("job_type", "ai_run")
      .contains("payload", { ai_run_id: pendingRunId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(job).not.toBeNull();
  });

  it("approve_ai_run rejeita uma run que não está mais em 'awaiting_approval' (já 'approved')", async () => {
    const { error } = await adminUserClient.rpc("approve_ai_run", { p_run_id: pendingRunId, p_approve: true });
    expect(error).not.toBeNull();
  });

  it("isolamento entre tenants: admin de outra organização não consegue aprovar uma run que não é sua", async () => {
    // Cria um segundo admin em otherOrgId e tenta aprovar a run de orgId.
    const { data: otherAdmin } = await admin.auth.admin.createUser({
      email: `ai-other-admin-${Date.now()}@example.com`,
      password: "SenhaForte123!",
      email_confirm: true,
    });
    const otherAdminId = (otherAdmin as { user: { id: string } }).user.id;

    const { data: superAdminRole } = await admin.from("roles").select("id").eq("key", "super_admin").single();
    await admin.from("organization_memberships").insert({
      organization_id: otherOrgId,
      user_id: otherAdminId,
      role_id: (superAdminRole as { id: string }).id,
      status: "active",
      invited_by: otherAdminId,
    });

    const otherAdminClient = createClient(SUPABASE_URL, ANON_KEY);
    await otherAdminClient.auth.signInWithPassword({
      email: `ai-other-admin-${Date.now()}@example.com`,
      password: "SenhaForte123!",
    });

    const { error } = await otherAdminClient.rpc("approve_ai_run", { p_run_id: pendingRunId, p_approve: false });
    expect(error).not.toBeNull();

    await admin.auth.admin.deleteUser(otherAdminId);
  });

  it("ai_runs/ai_run_evidences nunca aceitam INSERT/UPDATE direto do client autenticado (nem admin da organização)", async () => {
    const { error: insertError } = await adminUserClient.from("ai_runs").insert({
      ai_agent_id: agentId,
      organization_id: orgId,
      trigger_type: "manual",
      input: {},
      status: "succeeded",
    });
    expect(insertError).not.toBeNull();

    const { error: updateError } = await adminUserClient
      .from("ai_runs")
      .update({ status: "succeeded" })
      .eq("id", pendingRunId);
    // Nenhuma linha afetada (RLS bloqueia) — Postgrest não retorna erro para
    // UPDATE que afeta zero linhas, então validamos que o status NÃO mudou.
    void updateError;
    const { data: run } = await admin.from("ai_runs").select("status").eq("id", pendingRunId).single();
    expect((run as { status: string }).status).toBe("approved");

    const { error: evidenceInsertError } = await adminUserClient.from("ai_run_evidences").insert({
      ai_run_id: pendingRunId,
      source_excerpt: "tentativa de forjar evidência",
    });
    expect(evidenceInsertError).not.toBeNull();
  });

  it("qualquer membro ativo da organização consegue LER ai_runs (observabilidade/auditoria)", async () => {
    const { data, error } = await memberUserClient.from("ai_runs").select("id").eq("id", pendingRunId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("membro de outra organização não consegue ler ai_runs deste tenant", async () => {
    const { data: card } = await adminUserClient
      .from("cards")
      .insert({ pipe_id: pipeId, current_phase_id: phaseOpenId, title: "Contrato Gamma", created_by: adminUserId })
      .select("id")
      .single();
    void card;

    // memberUserClient pertence a orgId, não a otherOrgId — usado aqui só
    // para reforçar que a leitura é por organização, não global.
    const { data } = await memberUserClient.from("ai_runs").select("id").eq("organization_id", otherOrgId);
    expect(data).toEqual([]);
  });

  void pendingCardId;
});

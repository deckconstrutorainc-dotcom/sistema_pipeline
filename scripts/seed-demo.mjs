/**
 * Popula o banco com um cenário de demonstração: uma construtora com dois
 * processos reais, cards em vários estados (no prazo, vencendo, atrasado,
 * com SLA estourado), etiquetas, responsáveis, comentários e checklists.
 *
 * Serve para avaliar a interface com conteúdo de verdade — telas vazias não
 * mostram densidade, cor por fase, indicadores nem alinhamento.
 *
 * Idempotente: se a organização já existir, não faz nada.
 *
 * Uso: node scripts/seed-demo.mjs <connection-string> <user-id> <email>
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

const [connectionString, userId, userEmail] = process.argv.slice(2);

if (!connectionString || !userId) {
  console.error("uso: node scripts/seed-demo.mjs <conn> <user-id> [email]");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60_000,
});

await client.connect();

/** Data relativa a agora, em dias (aceita fração). */
const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000);

try {
  await client.query("begin");

  const existing = await client.query(
    "select id from organizations where slug = 'deck-construtora'",
  );
  if (existing.rows.length > 0) {
    console.log("Organização de demonstração já existe — nada a fazer.");
    await client.query("rollback");
    await client.end();
    process.exit(0);
  }

  // --- Perfil e organização -------------------------------------------
  await client.query(
    `insert into profiles (id, full_name) values ($1, $2)
     on conflict (id) do update set full_name = excluded.full_name`,
    [userId, "Bruno Ferreira"],
  );

  const orgId = randomUUID();
  await client.query(
    "insert into organizations (id, name, slug, created_by) values ($1, $2, $3, $4)",
    [orgId, "Deck Construtora", "deck-construtora", userId],
  );

  const { rows: roleRows } = await client.query(
    "select id from roles where key = 'super_admin'",
  );
  await client.query(
    `insert into organization_memberships (organization_id, user_id, role_id, status)
     values ($1, $2, $3, 'active')`,
    [orgId, userId, roleRows[0].id],
  );

  // --- Colegas de equipe ----------------------------------------------
  // `profiles.id` referencia `auth.users`, então estes precisam ser usuários
  // reais — criados antes via Admin API e passados por TEAM_IDS, no formato
  // "uuid|Nome" separado por vírgula.
  const team = (process.env.TEAM_IDS ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const [id, name] = entry.split("|");
      return { id, name };
    });

  if (team.length === 0) {
    throw new Error("defina TEAM_IDS com os usuários da equipe (uuid|Nome,...)");
  }

  const memberRole = await client.query("select id from roles where key = 'member'");

  for (const person of team) {
    await client.query(
      `insert into profiles (id, full_name) values ($1, $2)
       on conflict (id) do update set full_name = excluded.full_name`,
      [person.id, person.name],
    );
    // Sem vínculo com a organização a RLS esconde estas pessoas da lista de
    // responsáveis atribuíveis.
    await client.query(
      `insert into organization_memberships (organization_id, user_id, role_id, status)
       values ($1, $2, $3, 'active')
       on conflict do nothing`,
      [orgId, person.id, memberRole.rows[0].id],
    );
  }

  // ====================================================================
  // Processo 1 — Compras e Suprimentos
  // ====================================================================
  const pipeId = randomUUID();
  await client.query(
    `insert into pipes (id, organization_id, name, description, created_by, next_card_number)
     values ($1, $2, $3, $4, $5, 1)`,
    [
      pipeId,
      orgId,
      "Compras e Suprimentos",
      "Solicitações de compra de material e contratação de serviços para as obras.",
      userId,
    ],
  );

  const phases = [
    { name: "Solicitação", color: "#3B82F6", initial: true, sla: null },
    { name: "Cotação", color: "#06B6D4", sla: 48 },
    { name: "Aprovação", color: "#F59E0B", sla: 24 },
    { name: "Compra", color: "#8B5CF6", sla: 72 },
    { name: "Entregue", color: "#10B981", final: true },
  ].map((phase, index) => ({ ...phase, id: randomUUID(), position: index }));

  for (const phase of phases) {
    await client.query(
      `insert into phases (id, pipe_id, name, position, is_initial, is_final, sla_hours, color)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        phase.id,
        pipeId,
        phase.name,
        phase.position,
        phase.initial ?? false,
        phase.final ?? false,
        phase.sla ?? null,
        phase.color,
      ],
    );
  }

  const fields = [
    { key: "obra", label: "Obra", type: "single_select", options: ["Residencial Vila Nova", "Edifício Aurora", "Galpão Industrial BR-101"] },
    { key: "valor_estimado", label: "Valor estimado", type: "currency" },
    { key: "fornecedor", label: "Fornecedor", type: "short_text" },
    { key: "urgencia", label: "Urgência", type: "single_select", options: ["Baixa", "Normal", "Alta"] },
    { key: "descricao", label: "Descrição", type: "long_text" },
  ].map((field, index) => ({ ...field, id: randomUUID(), position: index }));

  for (const field of fields) {
    await client.query(
      `insert into fields (id, pipe_id, label, field_key, type, position)
       values ($1, $2, $3, $4, $5, $6)`,
      [field.id, pipeId, field.label, field.key, field.type, field.position],
    );
    if (field.options) {
      for (const [index, option] of field.options.entries()) {
        await client.query(
          "insert into field_options (field_id, value, label, position) values ($1, $2, $3, $4)",
          [field.id, option, option, index],
        );
      }
    }
    // Visível em todas as fases; obrigatório só onde faz sentido.
    for (const phase of phases) {
      await client.query(
        `insert into phase_fields (phase_id, field_id, is_required, is_visible, position)
         values ($1, $2, $3, true, $4)`,
        [
          phase.id,
          field.id,
          // Fornecedor vira obrigatório para sair da Cotação — é o que
          // demonstra o bloqueio de movimentação por campo obrigatório.
          field.key === "fornecedor" && phase.name === "Cotação",
          field.position,
        ],
      );
    }
  }

  const labels = [
    { name: "Urgente", color: "#EF4444" },
    { name: "Elétrica", color: "#F59E0B" },
    { name: "Hidráulica", color: "#06B6D4" },
    { name: "Estrutura", color: "#8B5CF6" },
    { name: "Acabamento", color: "#10B981" },
  ].map((label) => ({ ...label, id: randomUUID() }));

  for (const label of labels) {
    await client.query(
      "insert into labels (id, pipe_id, name, color) values ($1, $2, $3, $4)",
      [label.id, pipeId, label.name, label.color],
    );
  }

  const cards = [
    {
      title: "Cimento CP-II 50kg — 400 sacos",
      phase: 0, due: 6, labels: [3], assignees: [0],
      values: { obra: "Residencial Vila Nova", valor_estimado: 18400, urgencia: "Normal", descricao: "Reposição para a laje do 4º pavimento." },
      comments: ["Conferir se o fornecedor mantém o preço da última compra."],
    },
    {
      title: "Fiação 2,5mm² — 3.000 metros",
      phase: 1, due: 2, labels: [1], assignees: [1], age: 3,
      values: { obra: "Edifício Aurora", valor_estimado: 9750, fornecedor: "Elétrica Central", urgencia: "Alta", descricao: "Instalação elétrica dos apartamentos tipo." },
      checklist: [["Solicitar 3 cotações", true], ["Comparar prazos de entrega", true], ["Validar com engenheiro", false]],
    },
    {
      title: "Tubos PVC 100mm — 200 barras",
      phase: 1, due: -1, labels: [2, 0], assignees: [2], age: 4,
      values: { obra: "Residencial Vila Nova", valor_estimado: 6200, urgencia: "Alta", descricao: "Rede de esgoto do bloco B. Obra parada aguardando material." },
      comments: ["Fornecedor habitual sem estoque.", "Buscando alternativa na região."],
    },
    {
      title: "Locação de betoneira 400L",
      phase: 2, due: 1, labels: [3], assignees: [0, 3], age: 1,
      values: { obra: "Galpão Industrial BR-101", valor_estimado: 3200, fornecedor: "LocaMáquinas", urgencia: "Normal", descricao: "Locação mensal, com opção de renovação." },
      checklist: [["Verificar disponibilidade", true], ["Negociar valor mensal", true]],
    },
    {
      title: "Janelas de alumínio — 32 unidades",
      phase: 2, due: -3, labels: [4, 0], assignees: [1], age: 5,
      values: { obra: "Edifício Aurora", valor_estimado: 47800, fornecedor: "Alumínio Sul", urgencia: "Alta", descricao: "Esquadrias dos apartamentos 101 a 408." },
      comments: ["Valor acima do orçado em 12%.", "Aguardando aprovação da diretoria."],
    },
    {
      title: "Argamassa colante AC-III — 150 sacos",
      phase: 3, due: 9, labels: [4], assignees: [2], age: 2,
      values: { obra: "Residencial Vila Nova", valor_estimado: 4350, fornecedor: "Construbase", urgencia: "Baixa", descricao: "Assentamento de porcelanato das áreas comuns." },
    },
    {
      title: "Vergalhão CA-50 10mm — 2 toneladas",
      phase: 3, due: 4, labels: [3], assignees: [3], age: 1,
      values: { obra: "Galpão Industrial BR-101", valor_estimado: 21600, fornecedor: "Aços Paraná", urgencia: "Normal", descricao: "Armadura das sapatas e pilares." },
      checklist: [["Emitir ordem de compra", true], ["Confirmar data de entrega", true], ["Agendar recebimento", false]],
    },
    {
      title: "Tinta acrílica branca — 80 latas 18L",
      phase: 4, labels: [4], assignees: [0], age: 12, done: true,
      values: { obra: "Residencial Vila Nova", valor_estimado: 12800, fornecedor: "Tintas Ipiranga", urgencia: "Normal", descricao: "Pintura das áreas internas do bloco A." },
      comments: ["Entregue e conferido no canteiro."],
    },
    {
      title: "Andaimes tubulares — 60 módulos",
      phase: 4, labels: [3], assignees: [1, 3], age: 20, done: true,
      values: { obra: "Edifício Aurora", valor_estimado: 15400, fornecedor: "LocaMáquinas", urgencia: "Normal", descricao: "Locação para fachada, 3 meses." },
    },
  ];

  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  let cardNumber = 1;

  for (const card of cards) {
    const cardId = randomUUID();
    const phase = phases[card.phase];
    const createdAt = daysFromNow(-(card.age ?? 0));
    // `updated_at` é o que o SLA usa hoje como proxy da entrada na fase.
    const updatedAt = daysFromNow(-(card.age ?? 0) * 0.6);

    await client.query(
      `insert into cards (id, pipe_id, current_phase_id, number, title, due_date,
                          is_archived, is_done, created_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10)`,
      [
        cardId, pipeId, phase.id, cardNumber, card.title,
        card.due === undefined ? null : daysFromNow(card.due),
        card.done ?? false, userId, createdAt, updatedAt,
      ],
    );
    cardNumber += 1;

    for (const [key, value] of Object.entries(card.values ?? {})) {
      const field = fieldByKey.get(key);
      if (!field) continue;
      await client.query(
        "insert into card_field_values (card_id, field_id, value) values ($1, $2, $3)",
        [cardId, field.id, JSON.stringify(value)],
      );
    }

    for (const index of card.labels ?? []) {
      await client.query(
        "insert into card_labels (card_id, label_id) values ($1, $2)",
        [cardId, labels[index].id],
      );
    }

    for (const index of card.assignees ?? []) {
      await client.query(
        "insert into card_assignments (card_id, user_id, assigned_by) values ($1, $2, $3)",
        [cardId, team[index].id, userId],
      );
    }

    for (const body of card.comments ?? []) {
      await client.query(
        "insert into comments (card_id, author_id, body) values ($1, $2, $3)",
        [cardId, userId, body],
      );
    }

    for (const [position, [title, isDone]] of (card.checklist ?? []).entries()) {
      await client.query(
        `insert into checklist_items (card_id, title, is_done, position, created_by)
         values ($1, $2, $3, $4, $5)`,
        [cardId, title, isDone, position, userId],
      );
    }
  }

  await client.query("update pipes set next_card_number = $1 where id = $2", [
    cardNumber,
    pipeId,
  ]);

  // ====================================================================
  // Processo 2 — Aprovação de Medições
  // ====================================================================
  const pipe2Id = randomUUID();
  await client.query(
    `insert into pipes (id, organization_id, name, description, created_by, next_card_number)
     values ($1, $2, $3, $4, $5, 1)`,
    [
      pipe2Id,
      orgId,
      "Aprovação de Medições",
      "Medições mensais de empreiteiros e liberação de pagamento.",
      userId,
    ],
  );

  const phases2 = [
    { name: "Recebida", color: "#64748B", initial: true },
    { name: "Conferência", color: "#F97316", sla: 48 },
    { name: "Aprovada", color: "#84CC16" },
    { name: "Paga", color: "#0D9488", final: true },
  ].map((phase, index) => ({ ...phase, id: randomUUID(), position: index }));

  for (const phase of phases2) {
    await client.query(
      `insert into phases (id, pipe_id, name, position, is_initial, is_final, sla_hours, color)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        phase.id, pipe2Id, phase.name, phase.position,
        phase.initial ?? false, phase.final ?? false, phase.sla ?? null, phase.color,
      ],
    );
  }

  const fields2 = [
    { key: "empreiteiro", label: "Empreiteiro", type: "short_text" },
    { key: "competencia", label: "Competência", type: "short_text" },
    { key: "valor_medicao", label: "Valor da medição", type: "currency" },
  ].map((field, index) => ({ ...field, id: randomUUID(), position: index }));

  for (const field of fields2) {
    await client.query(
      `insert into fields (id, pipe_id, label, field_key, type, position)
       values ($1, $2, $3, $4, $5, $6)`,
      [field.id, pipe2Id, field.label, field.key, field.type, field.position],
    );
    for (const phase of phases2) {
      await client.query(
        `insert into phase_fields (phase_id, field_id, is_required, is_visible, position)
         values ($1, $2, false, true, $3)`,
        [phase.id, field.id, field.position],
      );
    }
  }

  const cards2 = [
    { title: "Medição 08/2026 — Alvenaria Silva", phase: 0, due: 5, assignees: [0], values: { empreiteiro: "Alvenaria Silva ME", competencia: "08/2026", valor_medicao: 87400 } },
    { title: "Medição 08/2026 — Elétrica Central", phase: 1, due: 2, assignees: [1], age: 3, values: { empreiteiro: "Elétrica Central Ltda", competencia: "08/2026", valor_medicao: 42300 } },
    { title: "Medição 08/2026 — Pintura Costa", phase: 1, due: -2, assignees: [2], age: 6, values: { empreiteiro: "Pintura Costa", competencia: "08/2026", valor_medicao: 23900 } },
    { title: "Medição 07/2026 — Alvenaria Silva", phase: 3, assignees: [0], age: 25, done: true, values: { empreiteiro: "Alvenaria Silva ME", competencia: "07/2026", valor_medicao: 91200 } },
  ];

  const field2ByKey = new Map(fields2.map((f) => [f.key, f]));
  let card2Number = 1;

  for (const card of cards2) {
    const cardId = randomUUID();
    const phase = phases2[card.phase];
    await client.query(
      `insert into cards (id, pipe_id, current_phase_id, number, title, due_date,
                          is_archived, is_done, created_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10)`,
      [
        cardId, pipe2Id, phase.id, card2Number, card.title,
        card.due === undefined ? null : daysFromNow(card.due),
        card.done ?? false, userId,
        daysFromNow(-(card.age ?? 0)), daysFromNow(-(card.age ?? 0) * 0.6),
      ],
    );
    card2Number += 1;

    for (const [key, value] of Object.entries(card.values ?? {})) {
      const field = field2ByKey.get(key);
      if (!field) continue;
      await client.query(
        "insert into card_field_values (card_id, field_id, value) values ($1, $2, $3)",
        [cardId, field.id, JSON.stringify(value)],
      );
    }
    for (const index of card.assignees ?? []) {
      await client.query(
        "insert into card_assignments (card_id, user_id, assigned_by) values ($1, $2, $3)",
        [cardId, team[index].id, userId],
      );
    }
  }

  await client.query("update pipes set next_card_number = $1 where id = $2", [
    card2Number,
    pipe2Id,
  ]);

  await client.query("commit");

  console.log("Dados de demonstração criados:");
  console.log(`  Organização: Deck Construtora`);
  console.log(`  Pipes: 2 (Compras e Suprimentos, Aprovação de Medições)`);
  console.log(`  Cards: ${cards.length + cards2.length}`);
  console.log(`  Equipe: ${team.length} perfis`);
  if (userEmail) console.log(`  Acesso: ${userEmail}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("FALHOU:", error.message);
  if (error.detail) console.error("detalhe:", error.detail);
  await client.end();
  process.exit(1);
}

await client.end();

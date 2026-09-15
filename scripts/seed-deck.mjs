/**
 * Estrutura operacional da DECK Construtora.
 *
 * Cria os quatro processos setoriais (Financeiro, Compras, RH/DP/Admin e
 * Orçamentos) com as fases informadas pela empresa, o conjunto padrão de
 * campos de atividade e as etiquetas de prioridade.
 *
 * Idempotente por processo: cada pipe é criado só se ainda não existir com
 * o mesmo nome, para poder ser reexecutado sem duplicar.
 *
 * Uso:
 *   node scripts/seed-deck.mjs <connection-string> <admin-user-id>
 * Com TEAM (uuid|Nome|Setor|email, separados por vírgula) no ambiente.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

const [connectionString, adminUserId] = process.argv.slice(2);

if (!connectionString || !adminUserId) {
  console.error("uso: node scripts/seed-deck.mjs <conn> <admin-user-id>");
  process.exit(1);
}

const team = (process.env.TEAM ?? "")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [id, name, setor, email] = entry.split("|");
    return { id, name, setor, email };
  });

if (team.length === 0) {
  console.error("defina TEAM com os usuários (uuid|Nome|Setor|email,...)");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

await client.connect();

/**
 * Campos comuns a toda atividade, conforme especificação da DECK.
 *
 * Fora daqui, porque já são colunas ou tabelas próprias do sistema:
 *   título, responsável, status (fase), data de criação, prazo,
 *   anexos, comentários, checklist, histórico e atividades relacionadas.
 */
const CAMPOS_PADRAO = [
  { key: "descricao", label: "Descrição", type: "long_text" },
  {
    key: "prioridade",
    label: "Prioridade",
    type: "single_select",
    options: ["Urgente", "Alta", "Normal", "Baixa"],
  },
  { key: "solicitante", label: "Solicitante", type: "short_text" },
  {
    key: "setor_solicitante",
    label: "Setor solicitante",
    type: "single_select",
    options: ["Financeiro", "Compras", "RH / DP / Administrativo", "Orçamentos", "Obra", "Diretoria"],
  },
  { key: "data_conclusao", label: "Data de conclusão", type: "date" },
  { key: "observacoes", label: "Observações", type: "long_text" },
];

/** Etiquetas de prioridade, iguais em todos os processos. */
const ETIQUETAS = [
  { name: "Urgente", color: "#EF4444" },
  { name: "Alta", color: "#F97316" },
  { name: "Normal", color: "#3B82F6" },
  { name: "Baixa", color: "#64748B" },
  { name: "Aguardando terceiros", color: "#A855F7" },
  { name: "Retrabalho", color: "#EC4899" },
];

/**
 * Os quatro processos. As cores seguem o espectro das fases: azul no
 * início, âmbar/laranja no meio (espera e análise), verde na conclusão e
 * vermelho no encerramento negativo.
 *
 * `sla` é o prazo da fase em horas. Definido só onde a demora é um
 * problema real de processo — não em fases que dependem de terceiros.
 */
const PROCESSOS = [
  {
    nome: "Financeiro",
    descricao: "Contas a pagar, conciliação e demandas financeiras.",
    responsavelEmail: "financeiro@deckconstrutora.com.br",
    fases: [
      { nome: "Nova demanda", cor: "#3B82F6", inicial: true, sla: 24 },
      { nome: "Aguardando documentos", cor: "#F59E0B" },
      { nome: "Em análise", cor: "#06B6D4", sla: 48 },
      { nome: "Programado para pagamento", cor: "#8B5CF6" },
      { nome: "Pago", cor: "#84CC16" },
      { nome: "Aguardando baixa ou conciliação", cor: "#F97316", sla: 72 },
      { nome: "Concluído", cor: "#10B981", final: true },
    ],
    camposExtras: [
      { key: "valor", label: "Valor", type: "currency" },
      { key: "fornecedor_favorecido", label: "Fornecedor / Favorecido", type: "short_text" },
      { key: "vencimento", label: "Vencimento", type: "date" },
      {
        key: "forma_pagamento",
        label: "Forma de pagamento",
        type: "single_select",
        options: ["Boleto", "PIX", "Transferência", "Cartão", "Dinheiro"],
      },
      { key: "centro_custo", label: "Centro de custo / Obra", type: "short_text" },
    ],
  },
  {
    nome: "Compras",
    descricao: "Cotação, aprovação e recebimento de materiais e serviços.",
    responsavelEmail: "compras@deckconstrutora.com.br",
    fases: [
      { nome: "Solicitação recebida", cor: "#3B82F6", inicial: true, sla: 24 },
      { nome: "Cotação", cor: "#06B6D4", sla: 48 },
      { nome: "Aguardando propostas", cor: "#F59E0B" },
      { nome: "Análise de fornecedores", cor: "#0D9488", sla: 48 },
      { nome: "Aprovação", cor: "#A855F7", sla: 24 },
      { nome: "Pedido emitido", cor: "#8B5CF6" },
      { nome: "Aguardando entrega", cor: "#F97316" },
      { nome: "Material recebido", cor: "#84CC16" },
      { nome: "Concluído", cor: "#10B981", final: true },
    ],
    camposExtras: [
      { key: "material_servico", label: "Material / Serviço", type: "long_text" },
      { key: "quantidade", label: "Quantidade", type: "short_text" },
      { key: "valor_estimado", label: "Valor estimado", type: "currency" },
      { key: "fornecedor_escolhido", label: "Fornecedor escolhido", type: "short_text" },
      { key: "obra_destino", label: "Obra / Destino", type: "short_text" },
      { key: "previsao_entrega", label: "Previsão de entrega", type: "date" },
    ],
  },
  {
    nome: "RH / DP / Administrativo",
    descricao: "Admissões, demissões, benefícios, documentos e rotinas administrativas.",
    responsavelEmail: "deck@deckconstrutora.com.br",
    fases: [
      { nome: "Nova solicitação", cor: "#3B82F6", inicial: true, sla: 24 },
      { nome: "Aguardando documentação", cor: "#F59E0B" },
      { nome: "Em análise", cor: "#06B6D4", sla: 48 },
      { nome: "Em processamento", cor: "#8B5CF6", sla: 72 },
      { nome: "Aguardando assinatura ou aprovação", cor: "#F97316" },
      { nome: "Finalizado", cor: "#10B981", final: true },
    ],
    camposExtras: [
      {
        key: "tipo_solicitacao",
        label: "Tipo de solicitação",
        type: "single_select",
        options: [
          "Admissão",
          "Demissão",
          "Férias",
          "Atestado",
          "Benefícios",
          "Documentação",
          "Ponto / Frequência",
          "Treinamento",
          "Outros",
        ],
      },
      { key: "colaborador", label: "Colaborador envolvido", type: "short_text" },
      { key: "obra_setor", label: "Obra / Setor", type: "short_text" },
      { key: "documento_referencia", label: "Documento de referência", type: "short_text" },
    ],
  },
  {
    nome: "Orçamentos",
    descricao: "Oportunidades, levantamentos, composição de custos e propostas.",
    responsavelEmail: "orcamento@deckconstrutora.com.br",
    fases: [
      { nome: "Nova oportunidade", cor: "#3B82F6", inicial: true, sla: 24 },
      { nome: "Em análise", cor: "#06B6D4", sla: 48 },
      { nome: "Aguardando documentos", cor: "#F59E0B" },
      { nome: "Levantamento de quantitativos", cor: "#0D9488", sla: 120 },
      { nome: "Cotação", cor: "#84CC16", sla: 72 },
      { nome: "Composição de custos", cor: "#A855F7", sla: 72 },
      { nome: "Montagem da proposta", cor: "#8B5CF6", sla: 48 },
      { nome: "Revisão", cor: "#F97316", sla: 24 },
      { nome: "Proposta enviada", cor: "#EC4899" },
      { nome: "Aguardando resultado", cor: "#64748B" },
      { nome: "Ganho", cor: "#10B981", final: true },
      { nome: "Perdido", cor: "#EF4444", final: true },
    ],
    camposExtras: [
      { key: "cliente", label: "Cliente", type: "short_text" },
      { key: "objeto", label: "Objeto / Escopo", type: "long_text" },
      { key: "valor_proposta", label: "Valor da proposta", type: "currency" },
      { key: "data_entrega_proposta", label: "Entrega da proposta", type: "date" },
      {
        key: "origem",
        label: "Origem",
        type: "single_select",
        options: ["Licitação", "Cliente direto", "Indicação", "Convite", "Outros"],
      },
      { key: "concorrentes", label: "Concorrentes", type: "short_text" },
      { key: "motivo_perda", label: "Motivo (se perdido)", type: "long_text" },
    ],
  },
];

try {
  await client.query("begin");

  const org = await client.query(
    "select id, name from organizations order by created_at limit 1",
  );
  if (org.rows.length === 0) throw new Error("nenhuma organização encontrada");
  const orgId = org.rows[0].id;
  console.log(`Organização: ${org.rows[0].name}\n`);

  // --- Vincula a equipe à organização ---------------------------------
  const memberRole = await client.query("select id from roles where key = 'member'");
  for (const person of team) {
    await client.query(
      `insert into profiles (id, full_name) values ($1, $2)
       on conflict (id) do update set full_name = excluded.full_name`,
      [person.id, person.name],
    );
    await client.query(
      `insert into organization_memberships (organization_id, user_id, role_id, status)
       values ($1, $2, $3, 'active') on conflict do nothing`,
      [orgId, person.id, memberRole.rows[0].id],
    );
  }
  console.log(`${team.length} usuários vinculados à organização.\n`);

  const byEmail = new Map(team.map((p) => [p.email, p]));

  for (const processo of PROCESSOS) {
    const existing = await client.query(
      "select id from pipes where organization_id = $1 and name = $2",
      [orgId, processo.nome],
    );
    if (existing.rows.length > 0) {
      console.log(`· ${processo.nome} — já existe, pulando`);
      continue;
    }

    const pipeId = randomUUID();
    await client.query(
      `insert into pipes (id, organization_id, name, description, created_by, next_card_number)
       values ($1, $2, $3, $4, $5, 1)`,
      [pipeId, orgId, processo.nome, processo.descricao, adminUserId],
    );

    for (const [index, fase] of processo.fases.entries()) {
      await client.query(
        `insert into phases (pipe_id, name, position, is_initial, is_final, sla_hours, color)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pipeId,
          fase.nome,
          index,
          fase.inicial ?? false,
          fase.final ?? false,
          fase.sla ?? null,
          fase.cor,
        ],
      );
    }

    const campos = [...CAMPOS_PADRAO, ...processo.camposExtras];
    const phaseIds = await client.query("select id from phases where pipe_id = $1", [pipeId]);

    for (const [index, campo] of campos.entries()) {
      const fieldId = randomUUID();
      await client.query(
        `insert into fields (id, pipe_id, label, field_key, type, position)
         values ($1, $2, $3, $4, $5, $6)`,
        [fieldId, pipeId, campo.label, campo.key, campo.type, index],
      );

      if (campo.options) {
        for (const [optIndex, option] of campo.options.entries()) {
          await client.query(
            "insert into field_options (field_id, value, label, position) values ($1, $2, $3, $4)",
            [fieldId, option, option, optIndex],
          );
        }
      }

      for (const row of phaseIds.rows) {
        await client.query(
          `insert into phase_fields (phase_id, field_id, is_required, is_visible, position)
           values ($1, $2, $3, true, $4)`,
          // Descrição e prioridade são obrigatórias já na entrada: sem elas
          // a atividade não é priorizável nem compreensível por quem recebe.
          [row.id, fieldId, campo.key === "descricao" || campo.key === "prioridade", index],
        );
      }
    }

    for (const etiqueta of ETIQUETAS) {
      await client.query(
        "insert into labels (pipe_id, name, color) values ($1, $2, $3)",
        [pipeId, etiqueta.name, etiqueta.color],
      );
    }

    const dono = byEmail.get(processo.responsavelEmail);
    console.log(
      `✓ ${processo.nome}: ${processo.fases.length} fases, ${campos.length} campos` +
        (dono ? ` — ${dono.name}` : ""),
    );
  }

  await client.query("commit");
  console.log("\nEstrutura criada.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("FALHOU:", error.message);
  if (error.detail) console.error("detalhe:", error.detail);
  await client.end();
  process.exit(1);
}

await client.end();

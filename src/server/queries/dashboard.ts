/**
 * Dados agregados da tela inicial (`/dashboard`).
 *
 * Objetivo: um usuário comum (papel `member`) precisa ver, ao entrar, o que
 * é dele e está pendente — tarefas atribuídas e cards em que é responsável.
 * Administradores recebem, além disso, uma visão de gestão da organização.
 *
 * Regras seguidas aqui:
 *  - Leitura com o client autenticado normal (`createClient`), NUNCA
 *    service role: RLS (`tasks_select`, `cards_select` via `is_pipe_member`)
 *    já é a fronteira de autorização correta para dados do próprio usuário.
 *  - Sem N+1: as consultas independentes são disparadas em paralelo com
 *    `Promise.all`, em no máximo duas rodadas (a segunda depende da lista de
 *    pipes da organização para escopar os cards ao tenant ativo).
 *  - Lógica de prazo/atraso e métricas de gestão são REAPROVEITADAS de
 *    `src/lib/validation/cards.ts` e `src/server/services/reporting.ts` —
 *    nada de cálculo novo duplicado (CLAUDE.md §19).
 */
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { compareByDueUrgency, getDueStatus } from "@/lib/validation/cards";
import {
  completionRate,
  countCardsByPhase,
  summarizeSla,
  type CompletionRateResult,
  type ReportCardSnapshot,
  type ReportPhaseSnapshot,
  type SlaSummaryResult,
} from "@/server/services/reporting";

export type TaskStatusValue = "open" | "in_progress" | "done" | "cancelled";

/** Tarefa atribuída ao usuário autenticado, já com o contexto do card/pipe. */
export interface MyTaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: string | null;
  pipeId: string | null;
  pipeName: string | null;
  cardId: string | null;
  cardNumber: number | null;
  cardTitle: string | null;
}

/** Card não arquivado em que o usuário autenticado é responsável. */
export interface MyCardItem {
  id: string;
  pipeId: string;
  pipeName: string;
  number: number;
  title: string;
  dueDate: string | null;
  phaseName: string | null;
  isDone: boolean;
}

export interface DashboardKpis {
  /** Tarefas minhas com status `open` ou `in_progress`. */
  openTasks: number;
  /** Dessas, quantas já passaram do prazo. */
  overdueTasks: number;
  /** Cards ativos em que sou responsável. */
  myCards: number;
  /** Dessas, quantos já passaram do prazo. */
  overdueCards: number;
}

export interface PipeCardCount {
  pipeId: string;
  pipeName: string;
  activeCards: number;
}

/** Visão de gestão — só preenchida para `super_admin`/`admin`. */
export interface OrgOverview {
  pipeCounts: PipeCardCount[];
  sla: SlaSummaryResult;
  completion: CompletionRateResult;
}

export interface DashboardData {
  kpis: DashboardKpis;
  myTasks: MyTaskItem[];
  /** Recorte dos cards mais urgentes (ver `myCardsTotal` para o total). */
  myCards: MyCardItem[];
  myCardsTotal: number;
  orgOverview: OrgOverview | null;
  /** true quando alguma consulta falhou — a página mostra o estado de erro. */
  hasLoadError: boolean;
}

/** Quantos cards do usuário são listados antes do link "ver todos". */
const MY_CARDS_LIMIT = 10;

const EMPTY_DATA: DashboardData = {
  kpis: { openTasks: 0, overdueTasks: 0, myCards: 0, overdueCards: 0 },
  myTasks: [],
  myCards: [],
  myCardsTotal: 0,
  orgOverview: null,
  hasLoadError: false,
};

interface PipeRow {
  id: string;
  name: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusValue;
  due_date: string | null;
  pipe_id: string | null;
  card_id: string | null;
}

interface CardRow {
  id: string;
  pipe_id: string;
  current_phase_id: string;
  number: number;
  title: string;
  due_date: string | null;
  is_archived: boolean;
  is_done: boolean;
  created_at: string;
  updated_at: string;
}

interface AssignmentRow {
  card_id: string;
  cards: CardRow | null;
}

interface PhaseRow {
  id: string;
  pipe_id: string;
  name: string;
  position: number;
  is_final: boolean;
  sla_hours: number | null;
}

/**
 * Carrega tudo que `/dashboard` precisa.
 *
 * @param organizationId organização ativa (multi-tenant: todo filtro passa por ela).
 * @param includeOrgOverview quando true (papel admin/super_admin verificado
 *   pelo chamador via `hasOrgRole`), agrega também a visão da organização.
 *   Quando false, as consultas da visão de gestão simplesmente não são
 *   executadas — o dado não chega ao servidor de render, nem à UI.
 */
export async function getDashboardData(
  organizationId: string,
  includeOrgOverview: boolean,
): Promise<DashboardData> {
  const user = await getCurrentUser();
  if (!user) {
    return EMPTY_DATA;
  }

  const supabase = await createClient();

  // Rodada 1 — pipes do tenant ativo. Necessário tanto para nomear os pipes
  // nas listas quanto para escopar cards ao tenant (cards não têm
  // organization_id: pertencem à organização pelo pipe).
  const pipesRes = await supabase
    .from("pipes")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .order("name", { ascending: true });

  const pipes = (pipesRes.data ?? []) as unknown as PipeRow[];
  const pipeIds = pipes.map((p) => p.id);
  const pipeNameById = new Map(pipes.map((p) => [p.id, p.name]));

  // Rodada 2 — todas as consultas restantes em paralelo.
  const tasksQuery = supabase
    .from("tasks")
    .select("id, title, description, status, due_date, pipe_id, card_id")
    .eq("organization_id", organizationId)
    .eq("assigned_to", user.id)
    .in("status", ["open", "in_progress"])
    .order("due_date", { ascending: true, nullsFirst: false });

  const assignmentsQuery = pipeIds.length
    ? supabase
        .from("card_assignments")
        .select(
          "card_id, cards!inner(id, pipe_id, current_phase_id, number, title, due_date, is_archived, is_done, created_at, updated_at)",
        )
        .eq("user_id", user.id)
        .eq("cards.is_archived", false)
        .in("cards.pipe_id", pipeIds)
    : null;

  const phasesQuery = pipeIds.length
    ? supabase
        .from("phases")
        .select("id, pipe_id, name, position, is_final, sla_hours")
        .in("pipe_id", pipeIds)
    : null;

  const orgCardsQuery =
    includeOrgOverview && pipeIds.length
      ? supabase
          .from("cards")
          .select(
            "id, pipe_id, current_phase_id, number, title, due_date, is_archived, is_done, created_at, updated_at",
          )
          .in("pipe_id", pipeIds)
          .eq("is_archived", false)
      : null;

  const [tasksRes, assignmentsRes, phasesRes, orgCardsRes] = await Promise.all([
    tasksQuery,
    assignmentsQuery,
    phasesQuery,
    orgCardsQuery,
  ]);

  const hasLoadError = Boolean(
    pipesRes.error ||
      tasksRes.error ||
      assignmentsRes?.error ||
      phasesRes?.error ||
      orgCardsRes?.error,
  );

  // ---------------------------------------------------------------
  // Fases (nome da fase atual dos meus cards + SLA da visão de gestão).
  // ---------------------------------------------------------------
  const phaseRows = (phasesRes?.data ?? []) as unknown as PhaseRow[];
  const phaseNameById = new Map(phaseRows.map((p) => [p.id, p.name]));

  // ---------------------------------------------------------------
  // Minhas tarefas.
  // ---------------------------------------------------------------
  const taskRows = (tasksRes.data ?? []) as unknown as TaskRow[];
  const taskCardIds = Array.from(
    new Set(taskRows.map((t) => t.card_id).filter((id): id is string => id !== null)),
  );

  // Uma única consulta extra (não por tarefa) para nomear os cards ligados
  // às tarefas — evita N+1 e só roda quando existem tarefas com card.
  const taskCardsRes = taskCardIds.length
    ? await supabase.from("cards").select("id, pipe_id, number, title").in("id", taskCardIds)
    : null;
  const taskCardById = new Map(
    ((taskCardsRes?.data ?? []) as unknown as {
      id: string;
      pipe_id: string;
      number: number;
      title: string;
    }[]).map((c) => [c.id, c]),
  );

  const myTasks: MyTaskItem[] = taskRows
    .slice()
    .sort((a, b) => compareByDueUrgency(a.due_date, b.due_date))
    .map((row) => {
      const card = row.card_id ? taskCardById.get(row.card_id) : undefined;
      const pipeId = row.pipe_id ?? card?.pipe_id ?? null;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        dueDate: row.due_date,
        pipeId,
        pipeName: pipeId ? (pipeNameById.get(pipeId) ?? null) : null,
        cardId: card?.id ?? null,
        cardNumber: card?.number ?? null,
        cardTitle: card?.title ?? null,
      };
    });

  // ---------------------------------------------------------------
  // Meus cards.
  // ---------------------------------------------------------------
  const assignmentRows = (assignmentsRes?.data ?? []) as unknown as AssignmentRow[];
  const allMyCards: MyCardItem[] = assignmentRows
    .map((row) => row.cards)
    .filter((card): card is CardRow => card !== null)
    .map((card) => ({
      id: card.id,
      pipeId: card.pipe_id,
      pipeName: pipeNameById.get(card.pipe_id) ?? "Pipe",
      number: card.number,
      title: card.title,
      dueDate: card.due_date,
      phaseName: phaseNameById.get(card.current_phase_id) ?? null,
      isDone: card.is_done,
    }))
    .sort((a, b) => compareByDueUrgency(a.dueDate, b.dueDate));

  // ---------------------------------------------------------------
  // KPIs (reaproveitando getDueStatus — sem lógica de prazo nova).
  // ---------------------------------------------------------------
  const kpis: DashboardKpis = {
    openTasks: myTasks.length,
    overdueTasks: myTasks.filter((t) => getDueStatus(t.dueDate) === "overdue").length,
    myCards: allMyCards.length,
    overdueCards: allMyCards.filter((c) => getDueStatus(c.dueDate) === "overdue").length,
  };

  // ---------------------------------------------------------------
  // Visão de gestão (admin) — delegada às funções puras do M6.
  // ---------------------------------------------------------------
  let orgOverview: OrgOverview | null = null;
  if (includeOrgOverview) {
    const orgCardRows = (orgCardsRes?.data ?? []) as unknown as CardRow[];

    const snapshots: ReportCardSnapshot[] = orgCardRows.map((row) => ({
      id: row.id,
      currentPhaseId: row.current_phase_id,
      isArchived: row.is_archived,
      isDone: row.is_done,
      dueDate: row.due_date,
      createdAt: row.created_at,
      phaseEnteredAt: row.updated_at,
    }));

    const phaseSnapshots: ReportPhaseSnapshot[] = phaseRows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      isFinal: row.is_final,
      slaHours: row.sla_hours,
    }));
    const phasesById = new Map(phaseSnapshots.map((p) => [p.id, p]));

    const snapshotsByPipe = new Map<string, ReportCardSnapshot[]>();
    orgCardRows.forEach((row, index) => {
      const snapshot = snapshots[index];
      if (!snapshot) return;
      const list = snapshotsByPipe.get(row.pipe_id) ?? [];
      list.push(snapshot);
      snapshotsByPipe.set(row.pipe_id, list);
    });
    const phasesByPipe = new Map<string, ReportPhaseSnapshot[]>();
    for (const row of phaseRows) {
      const list = phasesByPipe.get(row.pipe_id) ?? [];
      const snapshot = phasesById.get(row.id);
      if (snapshot) list.push(snapshot);
      phasesByPipe.set(row.pipe_id, list);
    }

    const pipeCounts: PipeCardCount[] = pipes.map((pipe) => ({
      pipeId: pipe.id,
      pipeName: pipe.name,
      // countCardsByPhase é a fonte de verdade de "card ativo em fase";
      // somar as fases do pipe dá o total ativo do pipe sem reimplementar
      // a regra de "não arquivado".
      activeCards: countCardsByPhase(
        snapshotsByPipe.get(pipe.id) ?? [],
        phasesByPipe.get(pipe.id) ?? [],
      ).reduce((sum, entry) => sum + entry.count, 0),
    }));

    orgOverview = {
      pipeCounts,
      sla: summarizeSla(snapshots, phasesById),
      completion: completionRate(snapshots),
    };
  }

  return {
    kpis,
    myTasks,
    myCards: allMyCards.slice(0, MY_CARDS_LIMIT),
    myCardsTotal: allMyCards.length,
    orgOverview,
    hasLoadError,
  };
}

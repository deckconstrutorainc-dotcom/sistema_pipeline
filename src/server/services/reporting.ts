/**
 * M6 — Gestão e Analytics.
 *
 * Funções PURAS (sem I/O) de cálculo de métricas de report/dashboard. Elas
 * recebem um snapshot de dados já carregados do Supabase (cards, phases,
 * card_activities de tipo `phase_changed`) e retornam o resultado agregado
 * — nunca fazem consulta ao banco, para permanecerem testáveis sem DB (ver
 * `tests/unit/reporting.test.ts`).
 *
 * Reaproveita deliberadamente `getDueStatus`/`getSlaStatus` de
 * `src/lib/validation/cards.ts` (CLAUDE.md §19 — "evite duplicação de
 * código") em vez de reimplementar a lógica de vencimento/SLA aqui.
 *
 * A busca dos dados brutos fica em `src/server/queries/reports.ts`, que
 * chama estas funções depois de carregar o snapshot via Supabase.
 */
import { getDueStatus, getSlaStatus } from "@/lib/validation/cards";

export interface ReportPhaseSnapshot {
  id: string;
  name: string;
  position: number;
  isFinal: boolean;
  slaHours: number | null;
}

export interface ReportCardSnapshot {
  id: string;
  currentPhaseId: string;
  isArchived: boolean;
  isDone: boolean;
  dueDate: string | null;
  createdAt: string;
  /** Momento em que o card entrou na fase atual (cards.updated_at — ver getSlaStatus). */
  phaseEnteredAt: string | null;
}

/** Uma entrada `phase_changed` de `card_activities`, já normalizada. */
export interface PhaseChangedActivity {
  cardId: string;
  fromPhaseId: string | null;
  toPhaseId: string;
  createdAt: string;
}

export interface PhaseCountEntry {
  phaseId: string;
  phaseName: string;
  count: number;
}

/** Contagem de cards (não arquivados) por fase, na ordem de `phases.position`. */
export function countCardsByPhase(
  cards: readonly ReportCardSnapshot[],
  phases: readonly ReportPhaseSnapshot[],
): PhaseCountEntry[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (card.isArchived) continue;
    counts.set(card.currentPhaseId, (counts.get(card.currentPhaseId) ?? 0) + 1);
  }

  return phases
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((phase) => ({
      phaseId: phase.id,
      phaseName: phase.name,
      count: counts.get(phase.id) ?? 0,
    }));
}

export interface AvgTimeInPhaseEntry {
  phaseId: string;
  phaseName: string;
  /** Tempo médio, em horas, que os cards passaram nesta fase antes de sair dela. */
  avgHours: number | null;
  /** Quantas passagens pela fase entraram no cálculo. */
  sampleSize: number;
}

/**
 * Tempo médio (em horas) que cards passaram em cada fase, calculado a
 * partir do histórico de `phase_changed` em `card_activities`: para cada
 * card, ordena suas transições cronologicamente e mede o intervalo entre
 * "entrou na fase X" e "saiu da fase X" (a transição seguinte, ou
 * `createdAt` do card para a primeira fase, já que não há activity
 * `phase_changed` registrando a entrada na fase inicial).
 */
export function averageTimeInPhase(
  cards: readonly ReportCardSnapshot[],
  phases: readonly ReportPhaseSnapshot[],
  activities: readonly PhaseChangedActivity[],
): AvgTimeInPhaseEntry[] {
  const durationsByPhase = new Map<string, number[]>();
  const cardCreatedAt = new Map(cards.map((c) => [c.id, c.createdAt]));

  const activitiesByCard = new Map<string, PhaseChangedActivity[]>();
  for (const activity of activities) {
    const list = activitiesByCard.get(activity.cardId) ?? [];
    list.push(activity);
    activitiesByCard.set(activity.cardId, list);
  }

  for (const [cardId, cardActivities] of activitiesByCard) {
    const sorted = cardActivities
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const createdAt = cardCreatedAt.get(cardId);

    for (let i = 0; i < sorted.length; i += 1) {
      const entry = sorted[i];
      if (!entry) continue;

      const phaseId = entry.toPhaseId;
      const enteredAt = entry.createdAt;
      const next = sorted[i + 1];
      const leftAt = next?.createdAt;
      if (!leftAt) continue; // fase atual (ainda não saiu) não entra na média de "tempo completo na fase".

      const durationMs = new Date(leftAt).getTime() - new Date(enteredAt).getTime();
      if (durationMs < 0) continue;

      const list = durationsByPhase.get(phaseId) ?? [];
      list.push(durationMs);
      durationsByPhase.set(phaseId, list);
    }

    // Tempo na fase inicial (antes da primeira transição registrada), usando createdAt do card.
    const first = sorted[0];
    if (first && first.fromPhaseId && createdAt) {
      const durationMs = new Date(first.createdAt).getTime() - new Date(createdAt).getTime();
      if (durationMs >= 0) {
        const list = durationsByPhase.get(first.fromPhaseId) ?? [];
        list.push(durationMs);
        durationsByPhase.set(first.fromPhaseId, list);
      }
    }
  }

  return phases
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((phase) => {
      const durations = durationsByPhase.get(phase.id) ?? [];
      const avgHours =
        durations.length === 0
          ? null
          : durations.reduce((sum, ms) => sum + ms, 0) / durations.length / (60 * 60 * 1000);
      return {
        phaseId: phase.id,
        phaseName: phase.name,
        avgHours,
        sampleSize: durations.length,
      };
    });
}

export interface CompletionRateResult {
  total: number;
  completed: number;
  /** 0..1, null quando não há cards (evita divisão por zero). */
  rate: number | null;
}

/** Taxa de conclusão: proporção de cards (não arquivados) com is_done = true. */
export function completionRate(cards: readonly ReportCardSnapshot[]): CompletionRateResult {
  const active = cards.filter((c) => !c.isArchived);
  const completed = active.filter((c) => c.isDone).length;
  return {
    total: active.length,
    completed,
    rate: active.length === 0 ? null : completed / active.length,
  };
}

export interface SlaSummaryResult {
  total: number;
  overdue: number;
  dueSoon: number;
  slaExceeded: number;
}

/**
 * Resumo de vencimento/SLA de um conjunto de cards, reaproveitando
 * getDueStatus/getSlaStatus (src/lib/validation/cards.ts) — nunca
 * reimplementa a lógica de "vencido"/"SLA excedido".
 */
export function summarizeSla(
  cards: readonly ReportCardSnapshot[],
  phasesById: ReadonlyMap<string, ReportPhaseSnapshot>,
  now: Date = new Date(),
): SlaSummaryResult {
  const active = cards.filter((c) => !c.isArchived);

  let overdue = 0;
  let dueSoon = 0;
  let slaExceeded = 0;

  for (const card of active) {
    const dueStatus = getDueStatus(card.dueDate, now);
    if (dueStatus === "overdue") overdue += 1;
    if (dueStatus === "due_soon") dueSoon += 1;

    const phase = phasesById.get(card.currentPhaseId);
    const slaStatus = getSlaStatus(phase?.slaHours ?? null, card.phaseEnteredAt, now);
    if (slaStatus === "sla_exceeded") slaExceeded += 1;
  }

  return { total: active.length, overdue, dueSoon, slaExceeded };
}

import { createClient } from "@/lib/supabase/server";
import type { ReportConfig } from "@/lib/validation/reports";
import {
  averageTimeInPhase,
  completionRate,
  countCardsByPhase,
  summarizeSla,
  type AvgTimeInPhaseEntry,
  type CompletionRateResult,
  type PhaseChangedActivity,
  type PhaseCountEntry,
  type ReportCardSnapshot,
  type ReportPhaseSnapshot,
  type SlaSummaryResult,
} from "@/server/services/reporting";

export interface ReportSummary {
  id: string;
  organizationId: string;
  pipeId: string | null;
  name: string;
  description: string | null;
  config: ReportConfig;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lista os reports visíveis ao usuário na organização (RLS decide o
 * subconjunto real). Quando `pipeId` é informado, filtra apenas os
 * reports escopados a esse pipe (`reports.pipe_id`) — usado pela aba
 * "Relatórios" dentro de um pipe, reaproveitando esta mesma query em vez
 * de duplicar a lógica de listagem.
 */
export async function listReports(organizationId: string, pipeId?: string): Promise<ReportSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("reports")
    .select("id, organization_id, pipe_id, name, description, config, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (pipeId) {
    query = query.eq("pipe_id", pipeId);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return (
    data as unknown as {
      id: string;
      organization_id: string;
      pipe_id: string | null;
      name: string;
      description: string | null;
      config: ReportConfig;
      created_by: string;
      created_at: string;
      updated_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    pipeId: row.pipe_id,
    name: row.name,
    description: row.description,
    config: row.config,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getReport(reportId: string): Promise<ReportSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, organization_id, pipe_id, name, description, config, created_by, created_at, updated_at")
    .eq("id", reportId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      pipe_id: string | null;
      name: string;
      description: string | null;
      config: ReportConfig;
      created_by: string;
      created_at: string;
      updated_at: string;
    }>();

  if (error || !data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    pipeId: data.pipe_id,
    name: data.name,
    description: data.description,
    config: data.config,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export interface ReportResult {
  metric: ReportConfig["metric"];
  phaseCounts?: PhaseCountEntry[];
  avgTimeInPhase?: AvgTimeInPhaseEntry[];
  completionRate?: CompletionRateResult;
  slaSummary?: SlaSummaryResult;
}

/**
 * Carrega os dados brutos do Supabase (cards, phases, card_activities do
 * tipo phase_changed) para o escopo do report (pipe específico, quando
 * `report.pipeId` setado, ou toda a organização) e delega o cálculo para
 * as funções puras de `src/server/services/reporting.ts`.
 */
export async function computeReportResult(report: ReportSummary): Promise<ReportResult> {
  const supabase = await createClient();

  // 1. Resolve os pipes dentro do escopo do report.
  let pipeIds: string[];
  if (report.pipeId) {
    pipeIds = [report.pipeId];
  } else {
    const { data: pipes } = await supabase
      .from("pipes")
      .select("id")
      .eq("organization_id", report.organizationId)
      .eq("is_archived", false);
    pipeIds = ((pipes ?? []) as { id: string }[]).map((p) => p.id);
  }

  if (pipeIds.length === 0) {
    return emptyResult(report.config.metric);
  }

  // 2. Fases dos pipes em escopo.
  const { data: phaseRows } = await supabase
    .from("phases")
    .select("id, pipe_id, name, position, is_final, sla_hours")
    .in("pipe_id", pipeIds);

  const allPhases: ReportPhaseSnapshot[] = (
    (phaseRows ?? []) as {
      id: string;
      pipe_id: string;
      name: string;
      position: number;
      is_final: boolean;
      sla_hours: number | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    isFinal: row.is_final,
    slaHours: row.sla_hours,
  }));

  const phases = report.config.phaseIds?.length
    ? allPhases.filter((p) => report.config.phaseIds!.includes(p.id))
    : allPhases;
  const phaseIds = phases.map((p) => p.id);

  // 3. Cards dos pipes em escopo, filtrados por fase/data quando configurado.
  let cardsQuery = supabase
    .from("cards")
    .select("id, current_phase_id, is_archived, is_done, due_date, created_at, updated_at")
    .in("pipe_id", pipeIds);

  if (phaseIds.length > 0 && report.config.phaseIds?.length) {
    cardsQuery = cardsQuery.in("current_phase_id", phaseIds);
  }
  if (report.config.dateFrom) {
    cardsQuery = cardsQuery.gte("created_at", report.config.dateFrom);
  }
  if (report.config.dateTo) {
    cardsQuery = cardsQuery.lte("created_at", report.config.dateTo);
  }

  const { data: cardRows } = await cardsQuery;

  const cards: ReportCardSnapshot[] = (
    (cardRows ?? []) as {
      id: string;
      current_phase_id: string;
      is_archived: boolean;
      is_done: boolean;
      due_date: string | null;
      created_at: string;
      updated_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    currentPhaseId: row.current_phase_id,
    isArchived: row.is_archived,
    isDone: row.is_done,
    dueDate: row.due_date,
    createdAt: row.created_at,
    phaseEnteredAt: row.updated_at,
  }));

  const cardIds = cards.map((c) => c.id);

  const metric = report.config.metric;

  if (metric === "phase_counts") {
    return { metric, phaseCounts: countCardsByPhase(cards, phases) };
  }

  if (metric === "completion_rate") {
    return { metric, completionRate: completionRate(cards) };
  }

  if (metric === "sla_summary") {
    const phasesById = new Map(allPhases.map((p) => [p.id, p]));
    return { metric, slaSummary: summarizeSla(cards, phasesById) };
  }

  // avg_time_in_phase — precisa do histórico de phase_changed.
  if (cardIds.length === 0) {
    return { metric, avgTimeInPhase: averageTimeInPhase([], phases, []) };
  }

  const { data: activityRows } = await supabase
    .from("card_activities")
    .select("card_id, payload, created_at")
    .eq("type", "phase_changed")
    .in("card_id", cardIds);

  const activities: PhaseChangedActivity[] = (
    (activityRows ?? []) as {
      card_id: string;
      payload: { from_phase_id: string | null; to_phase_id: string };
      created_at: string;
    }[]
  ).map((row) => ({
    cardId: row.card_id,
    fromPhaseId: row.payload?.from_phase_id ?? null,
    toPhaseId: row.payload?.to_phase_id,
    createdAt: row.created_at,
  }));

  return { metric, avgTimeInPhase: averageTimeInPhase(cards, phases, activities) };
}

function emptyResult(metric: ReportConfig["metric"]): ReportResult {
  if (metric === "phase_counts") return { metric, phaseCounts: [] };
  if (metric === "avg_time_in_phase") return { metric, avgTimeInPhase: [] };
  if (metric === "completion_rate") return { metric, completionRate: { total: 0, completed: 0, rate: null } };
  return { metric, slaSummary: { total: 0, overdue: 0, dueSoon: 0, slaExceeded: 0 } };
}

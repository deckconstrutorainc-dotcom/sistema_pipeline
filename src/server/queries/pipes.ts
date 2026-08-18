import { createClient } from "@/lib/supabase/server";

export interface PipeDetail {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  isRestricted: boolean;
}

export interface PhaseSummary {
  id: string;
  pipeId: string;
  name: string;
  position: number;
  isInitial: boolean;
  isFinal: boolean;
  slaHours: number | null;
}

export interface LabelSummary {
  id: string;
  name: string;
  color: string;
}

export interface FieldSummary {
  id: string;
  label: string;
  fieldKey: string;
  type: string;
  isArchived: boolean;
  options: { value: string; label: string }[];
}

export interface PhaseFieldRule {
  phaseId: string;
  fieldId: string;
  isRequired: boolean;
  isVisible: boolean;
}

export interface CardSummary {
  id: string;
  pipeId: string;
  currentPhaseId: string;
  number: number;
  title: string;
  dueDate: string | null;
  isArchived: boolean;
  isDone: boolean;
  updatedAt: string;
  labelIds: string[];
  assigneeIds: string[];
}

export interface PipeBoardData {
  pipe: PipeDetail;
  phases: PhaseSummary[];
  fields: FieldSummary[];
  phaseFields: PhaseFieldRule[];
  labels: LabelSummary[];
  cards: CardSummary[];
}

/**
 * Carrega os dados necessários para renderizar o kanban de um pipe. Retorna
 * `null` quando o pipe não existe OU quando o usuário não tem acesso a ele
 * — a policy `pipes_select` (via `is_pipe_member`) já garante que a query
 * só retorna o pipe se o usuário for autorizado; não há diferença
 * observável no client entre "não existe" e "sem permissão", o que é a
 * postura correta de segurança (evita vazar a existência de recursos de
 * outro tenant/pipe restrito).
 */
export async function getPipeBoardData(pipeId: string): Promise<PipeBoardData | null> {
  const supabase = await createClient();

  const { data: pipeRow, error: pipeError } = await supabase
    .from("pipes")
    .select("id, organization_id, name, description, is_archived, is_restricted")
    .eq("id", pipeId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      name: string;
      description: string | null;
      is_archived: boolean;
      is_restricted: boolean;
    }>();

  if (pipeError || !pipeRow) {
    return null;
  }

  const [phasesRes, fieldsRes, phaseFieldsRes, labelsRes, cardsRes, cardLabelsRes, assignmentsRes] =
    await Promise.all([
      supabase.from("phases").select("id, pipe_id, name, position, is_initial, is_final, sla_hours").eq(
        "pipe_id",
        pipeId,
      ).order("position", { ascending: true }),
      supabase
        .from("fields")
        .select("id, label, field_key, type, is_archived, field_options(value, label)")
        .eq("pipe_id", pipeId)
        .order("position", { ascending: true }),
      supabase
        .from("phase_fields")
        .select("phase_id, field_id, is_required, is_visible, fields!inner(pipe_id)")
        .eq("fields.pipe_id", pipeId),
      supabase.from("labels").select("id, name, color").eq("pipe_id", pipeId).order("name"),
      supabase
        .from("cards")
        .select("id, pipe_id, current_phase_id, number, title, due_date, is_archived, is_done, updated_at")
        .eq("pipe_id", pipeId)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
      supabase.from("card_labels").select("card_id, label_id, cards!inner(pipe_id)").eq(
        "cards.pipe_id",
        pipeId,
      ),
      supabase
        .from("card_assignments")
        .select("card_id, user_id, cards!inner(pipe_id)")
        .eq("cards.pipe_id", pipeId),
    ]);

  interface FieldOptionRow {
    value: string;
    label: string;
  }
  interface FieldRow {
    id: string;
    label: string;
    field_key: string;
    type: string;
    is_archived: boolean;
    field_options: FieldOptionRow[] | null;
  }
  interface PhaseFieldRow {
    phase_id: string;
    field_id: string;
    is_required: boolean;
    is_visible: boolean;
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
    updated_at: string;
  }
  interface CardLabelRow {
    card_id: string;
    label_id: string;
  }
  interface AssignmentRow {
    card_id: string;
    user_id: string;
  }

  const cardLabelsByCard = new Map<string, string[]>();
  for (const row of (cardLabelsRes.data ?? []) as unknown as CardLabelRow[]) {
    const list = cardLabelsByCard.get(row.card_id) ?? [];
    list.push(row.label_id);
    cardLabelsByCard.set(row.card_id, list);
  }

  const assigneesByCard = new Map<string, string[]>();
  for (const row of (assignmentsRes.data ?? []) as unknown as AssignmentRow[]) {
    const list = assigneesByCard.get(row.card_id) ?? [];
    list.push(row.user_id);
    assigneesByCard.set(row.card_id, list);
  }

  return {
    pipe: {
      id: pipeRow.id,
      organizationId: pipeRow.organization_id,
      name: pipeRow.name,
      description: pipeRow.description,
      isArchived: pipeRow.is_archived,
      isRestricted: pipeRow.is_restricted,
    },
    phases: ((phasesRes.data ?? []) as unknown as {
      id: string;
      pipe_id: string;
      name: string;
      position: number;
      is_initial: boolean;
      is_final: boolean;
      sla_hours: number | null;
    }[]).map((row) => ({
      id: row.id,
      pipeId: row.pipe_id,
      name: row.name,
      position: row.position,
      isInitial: row.is_initial,
      isFinal: row.is_final,
      slaHours: row.sla_hours,
    })),
    fields: ((fieldsRes.data ?? []) as unknown as FieldRow[]).map((row) => ({
      id: row.id,
      label: row.label,
      fieldKey: row.field_key,
      type: row.type,
      isArchived: row.is_archived,
      options: (row.field_options ?? []).map((o) => ({ value: o.value, label: o.label })),
    })),
    phaseFields: ((phaseFieldsRes.data ?? []) as unknown as PhaseFieldRow[]).map((row) => ({
      phaseId: row.phase_id,
      fieldId: row.field_id,
      isRequired: row.is_required,
      isVisible: row.is_visible,
    })),
    labels: ((labelsRes.data ?? []) as unknown as LabelSummary[]).map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
    })),
    cards: ((cardsRes.data ?? []) as unknown as CardRow[]).map((row) => ({
      id: row.id,
      pipeId: row.pipe_id,
      currentPhaseId: row.current_phase_id,
      number: row.number,
      title: row.title,
      dueDate: row.due_date,
      isArchived: row.is_archived,
      isDone: row.is_done,
      updatedAt: row.updated_at,
      labelIds: cardLabelsByCard.get(row.id) ?? [],
      assigneeIds: assigneesByCard.get(row.id) ?? [],
    })),
  };
}

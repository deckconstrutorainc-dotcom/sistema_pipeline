import { createClient } from "@/lib/supabase/server";
import { isFieldValueEmpty } from "@/lib/validation/fields";

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
  color: string | null;
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

export interface CardAssigneeSummary {
  id: string;
  fullName: string | null;
}

/** Um dos 2-3 primeiros campos preenchidos do card, usado como "resumo" no card-tile do Kanban. */
export interface CardSummaryField {
  fieldId: string;
  label: string;
  type: string;
  value: unknown;
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
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
  assignees: CardAssigneeSummary[];
  attachmentCount: number;
  summaryFields: CardSummaryField[];
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

  const [
    phasesRes,
    fieldsRes,
    phaseFieldsRes,
    labelsRes,
    cardsRes,
    cardLabelsRes,
    assignmentsRes,
    attachmentsRes,
    fieldValuesRes,
  ] = await Promise.all([
    supabase
      .from("phases")
      .select("id, pipe_id, name, position, is_initial, is_final, sla_hours, color")
      .eq("pipe_id", pipeId)
      .order("position", { ascending: true }),
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
      .select(
        "id, pipe_id, current_phase_id, number, title, due_date, is_archived, is_done, created_at, updated_at",
      )
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
    supabase
      .from("attachments")
      .select("card_id, cards!inner(pipe_id)")
      .eq("cards.pipe_id", pipeId),
    supabase
      .from("card_field_values")
      .select("card_id, field_id, value, cards!inner(pipe_id)")
      .eq("cards.pipe_id", pipeId),
  ]);

  // Nomes dos responsáveis (profiles.full_name), para os avatares do
  // card-tile — busca apenas os ids realmente atribuídos neste pipe.
  const assigneeUserIds = Array.from(
    new Set(((assignmentsRes.data ?? []) as unknown as { user_id: string }[]).map((r) => r.user_id)),
  );
  const profilesRes = assigneeUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", assigneeUserIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const profileNameById = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

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
    created_at: string;
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
  interface AttachmentRow {
    card_id: string;
  }
  interface FieldValueRow {
    card_id: string;
    field_id: string;
    value: unknown;
  }

  const cardLabelsByCard = new Map<string, string[]>();
  for (const row of (cardLabelsRes.data ?? []) as unknown as CardLabelRow[]) {
    const list = cardLabelsByCard.get(row.card_id) ?? [];
    list.push(row.label_id);
    cardLabelsByCard.set(row.card_id, list);
  }

  const assigneesByCard = new Map<string, CardAssigneeSummary[]>();
  for (const row of (assignmentsRes.data ?? []) as unknown as AssignmentRow[]) {
    const list = assigneesByCard.get(row.card_id) ?? [];
    list.push({ id: row.user_id, fullName: profileNameById.get(row.user_id) ?? null });
    assigneesByCard.set(row.card_id, list);
  }

  const attachmentCountByCard = new Map<string, number>();
  for (const row of (attachmentsRes.data ?? []) as unknown as AttachmentRow[]) {
    attachmentCountByCard.set(row.card_id, (attachmentCountByCard.get(row.card_id) ?? 0) + 1);
  }

  // Campos "resumo" do card-tile: os 2 primeiros valores preenchidos, na
  // ordem de `position` dos campos do pipe (mesma ordem em que `fields`
  // já vem ordenado acima) — não duplica a noção de "vazio", reaproveita
  // `isFieldValueEmpty` (src/lib/validation/fields.ts).
  const fieldMetaById = new Map(
    ((fieldsRes.data ?? []) as unknown as FieldRow[]).map((f) => [f.id, { label: f.label, type: f.type }]),
  );
  const fieldValuesByCard = new Map<string, { field_id: string; value: unknown }[]>();
  for (const row of (fieldValuesRes.data ?? []) as unknown as FieldValueRow[]) {
    const list = fieldValuesByCard.get(row.card_id) ?? [];
    list.push({ field_id: row.field_id, value: row.value });
    fieldValuesByCard.set(row.card_id, list);
  }
  const fieldPositionOrder = ((fieldsRes.data ?? []) as unknown as FieldRow[]).map((f) => f.id);

  function buildSummaryFields(cardId: string): CardSummaryField[] {
    const values = fieldValuesByCard.get(cardId) ?? [];
    const valueByFieldId = new Map(values.map((v) => [v.field_id, v.value]));
    const summary: CardSummaryField[] = [];
    for (const fieldId of fieldPositionOrder) {
      if (summary.length >= 2) break;
      const value = valueByFieldId.get(fieldId);
      if (isFieldValueEmpty(value)) continue;
      const meta = fieldMetaById.get(fieldId);
      if (!meta) continue;
      summary.push({ fieldId, label: meta.label, type: meta.type, value });
    }
    return summary;
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
      color: string | null;
    }[]).map((row) => ({
      id: row.id,
      pipeId: row.pipe_id,
      name: row.name,
      position: row.position,
      isInitial: row.is_initial,
      isFinal: row.is_final,
      slaHours: row.sla_hours,
      color: row.color,
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      labelIds: cardLabelsByCard.get(row.id) ?? [],
      assignees: assigneesByCard.get(row.id) ?? [],
      attachmentCount: attachmentCountByCard.get(row.id) ?? 0,
      summaryFields: buildSummaryFields(row.id),
    })),
  };
}

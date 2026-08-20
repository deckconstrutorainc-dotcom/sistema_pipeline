import { z } from "zod";

import { isFieldValueEmpty } from "@/lib/validation/fields";

export const createCardSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  phaseId: z.string().uuid("Fase inválida.").optional(),
  title: z.string().trim().min(1, "Informe o título do card.").max(200, "Título muito longo."),
  dueDate: z.string().datetime().optional().nullable(),
  fieldValues: z.record(z.string().uuid(), z.unknown()).optional(),
  assigneeId: z.string().uuid("Responsável inválido.").optional().nullable(),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardFieldsSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  title: z.string().trim().min(1, "Informe o título do card.").max(200).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  fieldValues: z.record(z.string().uuid(), z.unknown()).optional(),
});
export type UpdateCardFieldsInput = z.infer<typeof updateCardFieldsSchema>;

export const moveCardSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  targetPhaseId: z.string().uuid("Fase de destino inválida."),
});
export type MoveCardInput = z.infer<typeof moveCardSchema>;

export const assignUserSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  userId: z.string().uuid("Usuário inválido."),
});
export type AssignUserInput = z.infer<typeof assignUserSchema>;

export const unassignUserSchema = assignUserSchema;
export type UnassignUserInput = z.infer<typeof unassignUserSchema>;

export const cardLabelSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  labelId: z.string().uuid("Label inválida."),
});
export type CardLabelInput = z.infer<typeof cardLabelSchema>;

export const addCommentSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  body: z.string().trim().min(1, "Escreva um comentário.").max(5000, "Comentário muito longo."),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const archiveCardSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  isArchived: z.boolean(),
});
export type ArchiveCardInput = z.infer<typeof archiveCardSchema>;

// ---------------------------------------------------------------------
// Lógica pura de validação de campos obrigatórios por fase.
//
// Espelha exatamente a query usada dentro da função SQL `move_card()`
// (mesma noção de "vazio": null / string vazia / array vazio) para que a
// UI possa bloquear/avisar ANTES de chamar o servidor, sem jamais divergir
// do que o banco realmente vai aceitar — o banco continua sendo a fonte
// de verdade final (CLAUDE.md §13: "não confie em ocultação de elementos
// no frontend como mecanismo de segurança"; aqui não é segurança, é UX,
// a validação real acontece de novo dentro de move_card()).
// ---------------------------------------------------------------------

export interface PhaseFieldRequirement {
  fieldId: string;
  fieldLabel: string;
  isRequired: boolean;
  isArchived?: boolean;
}

/**
 * Retorna a lista de campos obrigatórios da fase informada que estão sem
 * valor preenchido em `values` (mapa fieldId -> valor).
 */
export function getMissingRequiredFields(
  phaseFields: readonly PhaseFieldRequirement[],
  values: Readonly<Record<string, unknown>>,
): PhaseFieldRequirement[] {
  return phaseFields.filter((pf) => {
    if (!pf.isRequired || pf.isArchived) return false;
    return isFieldValueEmpty(values[pf.fieldId]);
  });
}

// ---------------------------------------------------------------------
// Indicadores de SLA/prazo — lógica pura, usada no kanban e no card.
// ---------------------------------------------------------------------

export type DueStatus = "none" | "on_time" | "due_soon" | "overdue";

/** Janela considerada "vencendo em breve" antes do prazo. */
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getDueStatus(dueDate: string | null | undefined, now: Date = new Date()): DueStatus {
  if (!dueDate) return "none";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "none";

  const diff = due.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff <= DUE_SOON_WINDOW_MS) return "due_soon";
  return "on_time";
}

export type SlaStatus = "none" | "within_sla" | "sla_exceeded";

/**
 * Indica se o SLA da fase atual foi excedido, a partir de quando o card
 * entrou na fase (`phaseEnteredAt` — na prática, `cards.updated_at` no
 * momento em que `current_phase_id` foi o valor atual, já que
 * `move_card()` sempre atualiza `updated_at` junto com a fase) e
 * `slaHours` configurado na fase.
 */
export function getSlaStatus(
  slaHours: number | null | undefined,
  phaseEnteredAt: string | null | undefined,
  now: Date = new Date(),
): SlaStatus {
  if (!slaHours || !phaseEnteredAt) return "none";
  const enteredAt = new Date(phaseEnteredAt);
  if (Number.isNaN(enteredAt.getTime())) return "none";

  const deadline = enteredAt.getTime() + slaHours * 60 * 60 * 1000;
  return now.getTime() > deadline ? "sla_exceeded" : "within_sla";
}

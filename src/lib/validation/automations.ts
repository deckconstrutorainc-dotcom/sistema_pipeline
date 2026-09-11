import { z } from "zod";

/**
 * Eventos de trigger suportados no M3 (CLAUDE.md §11 / PROMPT_MESTRE M3).
 * Espelha exatamente o `check` constraint de
 * `public.automations.trigger_event` (migration `20260818091300_automations.sql`)
 * e `public.domain_events.event_type` (`20260818091200_domain_events.sql`)
 * — qualquer novo evento precisa ser adicionado nos três lugares.
 */
export const triggerEvents = [
  "card.created",
  "card.moved",
  "card.field.updated",
  "card.overdue",
  "phase.sla.exceeded",
] as const;
export type TriggerEvent = (typeof triggerEvents)[number];

/** Operadores de condição suportados por `evaluateConditions()`. */
export const conditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "empty",
  "not_empty",
  "greater_than",
  "less_than",
] as const;
export type ConditionOperator = (typeof conditionOperators)[number];

export const automationConditionSchema = z.object({
  field: z.string().trim().min(1, "Informe o campo da condição."),
  operator: z.enum(conditionOperators),
  value: z.unknown().optional(),
});
export type AutomationConditionInput = z.infer<typeof automationConditionSchema>;

/** Tipos de ação suportados no M3. */
export const actionTypes = [
  "move_card",
  "update_field",
  "assign_user",
  "add_label",
  "send_notification",
] as const;
export type ActionType = (typeof actionTypes)[number];

export const automationActionSchema = z.object({
  type: z.enum(actionTypes),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type AutomationActionInput = z.infer<typeof automationActionSchema>;

export const createAutomationSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  name: z.string().trim().min(1, "Informe o nome da automação.").max(120, "Nome muito longo."),
  description: z.string().trim().max(500).optional(),
  triggerEvent: z.enum(triggerEvents),
  conditions: z.array(automationConditionSchema).default([]),
  actions: z.array(automationActionSchema).min(1, "Configure ao menos uma ação."),
});
export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

export const updateAutomationSchema = z.object({
  automationId: z.string().uuid("Automação inválida."),
  pipeId: z.string().uuid("Pipe inválido."),
  name: z.string().trim().min(1, "Informe o nome da automação.").max(120).optional(),
  description: z.string().trim().max(500).optional(),
  triggerEvent: z.enum(triggerEvents).optional(),
  conditions: z.array(automationConditionSchema).optional(),
  actions: z.array(automationActionSchema).min(1, "Configure ao menos uma ação.").optional(),
});
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;

export const toggleAutomationSchema = z.object({
  automationId: z.string().uuid("Automação inválida."),
  pipeId: z.string().uuid("Pipe inválido."),
  isActive: z.boolean(),
});
export type ToggleAutomationInput = z.infer<typeof toggleAutomationSchema>;

export const listAutomationRunsSchema = z.object({
  automationId: z.string().uuid("Automação inválida."),
});
export type ListAutomationRunsInput = z.infer<typeof listAutomationRunsSchema>;

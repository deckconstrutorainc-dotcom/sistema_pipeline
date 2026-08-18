import { z } from "zod";

export const createPhaseSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da fase.")
    .max(120, "Nome muito longo."),
  description: z.string().trim().max(2000).optional(),
  isInitial: z.boolean().default(false),
  isFinal: z.boolean().default(false),
  slaHours: z
    .number()
    .int("Informe um número inteiro de horas.")
    .positive("O SLA deve ser maior que zero.")
    .max(24 * 365, "SLA muito alto.")
    .nullable()
    .optional(),
});
export type CreatePhaseInput = z.infer<typeof createPhaseSchema>;

export const updatePhaseSchema = z.object({
  phaseId: z.string().uuid("Fase inválida."),
  pipeId: z.string().uuid("Pipe inválido."),
  name: z.string().trim().min(1, "Informe o nome da fase.").max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  isInitial: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  slaHours: z
    .number()
    .int("Informe um número inteiro de horas.")
    .positive("O SLA deve ser maior que zero.")
    .max(24 * 365, "SLA muito alto.")
    .nullable()
    .optional(),
});
export type UpdatePhaseInput = z.infer<typeof updatePhaseSchema>;

export const reorderPhasesSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  orderedPhaseIds: z
    .array(z.string().uuid())
    .min(1, "Informe ao menos uma fase para reordenar."),
});
export type ReorderPhasesInput = z.infer<typeof reorderPhasesSchema>;

export const deletePhaseSchema = z.object({
  phaseId: z.string().uuid("Fase inválida."),
  pipeId: z.string().uuid("Pipe inválido."),
});
export type DeletePhaseInput = z.infer<typeof deletePhaseSchema>;

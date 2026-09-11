import { z } from "zod";

export const createPipeSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do pipe.")
    .max(120, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  icon: z.string().trim().max(60).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use formato hexadecimal, ex.: #6b7280).")
    .optional(),
  isRestricted: z.boolean().default(false),
});
export type CreatePipeInput = z.infer<typeof createPipeSchema>;

export const updatePipeSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do pipe.")
    .max(120, "Nome muito longo.")
    .optional(),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  icon: z.string().trim().max(60).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use formato hexadecimal, ex.: #6b7280).")
    .optional(),
  isRestricted: z.boolean().optional(),
  startFormPhaseId: z.string().uuid().nullable().optional(),
});
export type UpdatePipeInput = z.infer<typeof updatePipeSchema>;

export const archivePipeSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  isArchived: z.boolean(),
});
export type ArchivePipeInput = z.infer<typeof archivePipeSchema>;

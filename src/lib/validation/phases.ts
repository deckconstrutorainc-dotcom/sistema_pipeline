import { z } from "zod";

// Paleta fixa de cores para as fases do Kanban (não é um color picker livre
// — CLAUDE.md §3.30/§30: interface própria, não uma réplica visual de
// nenhuma ferramenta de mercado). Qualquer hex fora desta lista ainda é
// aceito pelo schema/constraint do banco (permite dados legados ou futura
// expansão), mas a UI só oferece estas oito opções.
// Ordenada pelo espectro (azul → ciano → verde → amarelo → vermelho → roxo →
// cinza) para que o seletor de cores leia como uma régua contínua.
//
// Os oito primeiros hex são EXATAMENTE os da paleta original e continuam
// gravados em `phases.color` — expandir a lista é retrocompatível porque o
// schema e a constraint do banco aceitam qualquer hex válido. Nunca remova
// um hex desta lista sem migrar os dados que já o referenciam.
export const phaseColorPalette = [
  "#3B82F6", // azul
  "#06B6D4", // ciano
  "#0D9488", // teal      (adicionado no redesenho)
  "#10B981", // esmeralda
  "#84CC16", // lima      (adicionado no redesenho)
  "#F59E0B", // âmbar
  "#F97316", // laranja   (adicionado no redesenho)
  "#EF4444", // vermelho
  "#EC4899", // rosa
  "#A855F7", // púrpura   (adicionado no redesenho)
  "#8B5CF6", // violeta
  "#64748B", // cinza
] as const;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida.")
  .nullable();

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
  color: hexColorSchema.optional(),
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
  color: hexColorSchema.optional(),
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

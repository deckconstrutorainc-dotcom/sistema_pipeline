import { z } from "zod";

// ---------------------------------------------------------------------
// reports.config — estrutura livre e versionável (CLAUDE.md §8), validada
// aqui em vez de confiada como jsonb opaco. `metric` decide quais funções
// de src/server/services/reporting.ts são chamadas por
// src/server/queries/reports.ts ao montar o resultado exibido.
// ---------------------------------------------------------------------

export const reportMetricValues = [
  "phase_counts",
  "avg_time_in_phase",
  "completion_rate",
  "sla_summary",
] as const;
export type ReportMetric = (typeof reportMetricValues)[number];

export const reportConfigSchema = z.object({
  metric: z.enum(reportMetricValues),
  phaseIds: z.array(z.string().uuid()).optional(),
  dateFrom: z.string().datetime().optional().nullable(),
  dateTo: z.string().datetime().optional().nullable(),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

export const createReportSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  pipeId: z.string().uuid("Pipe inválido.").optional().nullable(),
  name: z.string().trim().min(2, "Informe o nome do report.").max(120, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  config: reportConfigSchema,
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const updateReportSchema = z.object({
  reportId: z.string().uuid("Report inválido."),
  name: z.string().trim().min(2, "Informe o nome do report.").max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  config: reportConfigSchema.optional(),
});
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

export const deleteReportSchema = z.object({
  reportId: z.string().uuid("Report inválido."),
});
export type DeleteReportInput = z.infer<typeof deleteReportSchema>;

import { z } from "zod";

export const dashboardWidgetTypeValues = [
  "kpi",
  "bar_chart",
  "line_chart",
  "pie_chart",
  "table",
  "sla_summary",
] as const;
export type DashboardWidgetType = (typeof dashboardWidgetTypeValues)[number];

export const createDashboardSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  name: z.string().trim().min(2, "Informe o nome do dashboard.").max(120, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
});
export type CreateDashboardInput = z.infer<typeof createDashboardSchema>;

export const setDefaultDashboardSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  dashboardId: z.string().uuid("Dashboard inválido."),
});
export type SetDefaultDashboardInput = z.infer<typeof setDefaultDashboardSchema>;

export const addWidgetSchema = z.object({
  dashboardId: z.string().uuid("Dashboard inválido."),
  reportId: z.string().uuid("Report inválido.").optional().nullable(),
  widgetType: z.enum(dashboardWidgetTypeValues),
  title: z.string().trim().min(1, "Informe o título do widget.").max(120, "Título muito longo."),
  config: z.record(z.string(), z.unknown()).optional(),
  positionX: z.number().int().min(0).default(0),
  positionY: z.number().int().min(0).default(0),
  width: z.number().int().min(1).max(12).default(4),
  height: z.number().int().min(1).max(12).default(3),
});
export type AddWidgetInput = z.infer<typeof addWidgetSchema>;

export const updateWidgetSchema = z.object({
  widgetId: z.string().uuid("Widget inválido."),
  dashboardId: z.string().uuid("Dashboard inválido."),
  title: z.string().trim().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  positionX: z.number().int().min(0).optional(),
  positionY: z.number().int().min(0).optional(),
  width: z.number().int().min(1).max(12).optional(),
  height: z.number().int().min(1).max(12).optional(),
});
export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;

export const removeWidgetSchema = z.object({
  widgetId: z.string().uuid("Widget inválido."),
  dashboardId: z.string().uuid("Dashboard inválido."),
});
export type RemoveWidgetInput = z.infer<typeof removeWidgetSchema>;

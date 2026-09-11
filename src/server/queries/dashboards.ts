import { createClient } from "@/lib/supabase/server";
import type { DashboardWidgetType } from "@/lib/validation/dashboards";

export interface DashboardSummary {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidgetSummary {
  id: string;
  dashboardId: string;
  reportId: string | null;
  widgetType: DashboardWidgetType;
  title: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export interface DashboardDetail {
  dashboard: DashboardSummary;
  widgets: DashboardWidgetSummary[];
}

function mapDashboardRow(row: {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}): DashboardSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDashboards(organizationId: string): Promise<DashboardSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboards")
    .select("id, organization_id, name, description, is_default, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Parameters<typeof mapDashboardRow>[0][]).map(mapDashboardRow);
}

/**
 * Carrega um dashboard e seus widgets. Retorna `null` quando o dashboard
 * não existe ou o usuário não tem acesso (RLS decide, mesma postura de
 * `getCardDetail`).
 */
export async function getDashboardDetail(dashboardId: string): Promise<DashboardDetail | null> {
  const supabase = await createClient();

  const { data: dashboardRow, error } = await supabase
    .from("dashboards")
    .select("id, organization_id, name, description, is_default, created_by, created_at, updated_at")
    .eq("id", dashboardId)
    .maybeSingle<Parameters<typeof mapDashboardRow>[0]>();

  if (error || !dashboardRow) return null;

  const { data: widgetRows } = await supabase
    .from("dashboard_widgets")
    .select("id, dashboard_id, report_id, widget_type, title, config, position_x, position_y, width, height")
    .eq("dashboard_id", dashboardId)
    .order("position_y", { ascending: true })
    .order("position_x", { ascending: true });

  const widgets: DashboardWidgetSummary[] = (
    (widgetRows ?? []) as {
      id: string;
      dashboard_id: string;
      report_id: string | null;
      widget_type: DashboardWidgetType;
      title: string;
      config: Record<string, unknown>;
      position_x: number;
      position_y: number;
      width: number;
      height: number;
    }[]
  ).map((row) => ({
    id: row.id,
    dashboardId: row.dashboard_id,
    reportId: row.report_id,
    widgetType: row.widget_type,
    title: row.title,
    config: row.config,
    positionX: row.position_x,
    positionY: row.position_y,
    width: row.width,
    height: row.height,
  }));

  return { dashboard: mapDashboardRow(dashboardRow), widgets };
}

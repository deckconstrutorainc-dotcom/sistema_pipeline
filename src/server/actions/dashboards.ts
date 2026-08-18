"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  addWidgetSchema,
  createDashboardSchema,
  removeWidgetSchema,
  setDefaultDashboardSchema,
  updateWidgetSchema,
  type AddWidgetInput,
  type CreateDashboardInput,
  type RemoveWidgetInput,
  type SetDefaultDashboardInput,
  type UpdateWidgetInput,
} from "@/lib/validation/dashboards";

export interface ActionResult {
  success: boolean;
  error?: string;
  dashboardId?: string;
  widgetId?: string;
}

async function requireDashboardManager(dashboardId: string): Promise<{ organizationId: string }> {
  const supabase = await createClient();
  const { data: dashboard } = await supabase
    .from("dashboards")
    .select("organization_id")
    .eq("id", dashboardId)
    .maybeSingle<{ organization_id: string }>();

  if (!dashboard) {
    throw new Error("Dashboard não encontrado.");
  }
  await requireOrgRole(dashboard.organization_id, ["super_admin", "admin"]);
  return { organizationId: dashboard.organization_id };
}

export async function createDashboard(input: CreateDashboardInput): Promise<ActionResult> {
  const parsed = createDashboardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dashboards")
    .insert({
      organization_id: parsed.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o dashboard." };
  }

  revalidatePath("/dashboards");
  return { success: true, dashboardId: (data as { id: string }).id };
}

/**
 * Marca `dashboardId` como padrão da organização, garantindo com duas
 * escritas sequenciais que apenas um dashboard por organização tenha
 * `is_default = true` (sem constraint de unicidade parcial nesta fase —
 * suficiente para o volume esperado de dashboards por organização; uma
 * race condition entre dois admins definindo o padrão ao mesmo tempo é
 * aceitável como última-escrita-vence, sem risco de integridade de dados
 * de negócio).
 */
export async function setDefaultDashboard(input: SetDefaultDashboardInput): Promise<ActionResult> {
  const parsed = setDefaultDashboardSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("dashboards")
    .update({ is_default: false })
    .eq("organization_id", parsed.data.organizationId)
    .eq("is_default", true);

  if (clearError) {
    return { success: false, error: "Não foi possível atualizar o dashboard padrão." };
  }

  const { error: setError } = await supabase
    .from("dashboards")
    .update({ is_default: true })
    .eq("id", parsed.data.dashboardId)
    .eq("organization_id", parsed.data.organizationId);

  if (setError) {
    return { success: false, error: "Não foi possível definir o dashboard padrão." };
  }

  revalidatePath("/dashboards");
  return { success: true, dashboardId: parsed.data.dashboardId };
}

export async function addWidget(input: AddWidgetInput): Promise<ActionResult> {
  const parsed = addWidgetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDashboardManager(parsed.data.dashboardId);
  } catch {
    return { success: false, error: "Dashboard não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_widgets")
    .insert({
      dashboard_id: parsed.data.dashboardId,
      report_id: parsed.data.reportId ?? null,
      widget_type: parsed.data.widgetType,
      title: parsed.data.title,
      config: parsed.data.config ?? {},
      position_x: parsed.data.positionX,
      position_y: parsed.data.positionY,
      width: parsed.data.width,
      height: parsed.data.height,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível adicionar o widget." };
  }

  revalidatePath(`/dashboards/${parsed.data.dashboardId}`);
  return { success: true, widgetId: (data as { id: string }).id };
}

export async function updateWidget(input: UpdateWidgetInput): Promise<ActionResult> {
  const parsed = updateWidgetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDashboardManager(parsed.data.dashboardId);
  } catch {
    return { success: false, error: "Dashboard não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.config !== undefined) update.config = parsed.data.config;
  if (parsed.data.positionX !== undefined) update.position_x = parsed.data.positionX;
  if (parsed.data.positionY !== undefined) update.position_y = parsed.data.positionY;
  if (parsed.data.width !== undefined) update.width = parsed.data.width;
  if (parsed.data.height !== undefined) update.height = parsed.data.height;

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_widgets")
    .update(update)
    .eq("id", parsed.data.widgetId)
    .eq("dashboard_id", parsed.data.dashboardId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o widget." };
  }

  revalidatePath(`/dashboards/${parsed.data.dashboardId}`);
  return { success: true, widgetId: parsed.data.widgetId };
}

export async function removeWidget(input: RemoveWidgetInput): Promise<ActionResult> {
  const parsed = removeWidgetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireDashboardManager(parsed.data.dashboardId);
  } catch {
    return { success: false, error: "Dashboard não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_widgets")
    .delete()
    .eq("id", parsed.data.widgetId)
    .eq("dashboard_id", parsed.data.dashboardId);

  if (error) {
    return { success: false, error: "Não foi possível remover o widget." };
  }

  revalidatePath(`/dashboards/${parsed.data.dashboardId}`);
  return { success: true };
}

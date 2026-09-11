"use server";

import { revalidatePath } from "next/cache";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createReportSchema,
  deleteReportSchema,
  updateReportSchema,
  type CreateReportInput,
  type DeleteReportInput,
  type UpdateReportInput,
} from "@/lib/validation/reports";

export interface ActionResult {
  success: boolean;
  error?: string;
  reportId?: string;
}

/** Estrutura de report só pode ser gerenciada por admin/super_admin — mesmo padrão de requireDatabaseManager (M4). */
async function requireReportManager(reportId: string): Promise<void> {
  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("organization_id")
    .eq("id", reportId)
    .maybeSingle<{ organization_id: string }>();

  if (!report) {
    throw new Error("Report não encontrado.");
  }
  await requireOrgRole(report.organization_id, ["super_admin", "admin"]);
}

export async function createReport(input: CreateReportInput): Promise<ActionResult> {
  const parsed = createReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reports")
    .insert({
      organization_id: parsed.data.organizationId,
      pipe_id: parsed.data.pipeId ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: parsed.data.config,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o report." };
  }

  revalidatePath("/reports");
  return { success: true, reportId: (data as { id: string }).id };
}

export async function updateReport(input: UpdateReportInput): Promise<ActionResult> {
  const parsed = updateReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireReportManager(parsed.data.reportId);
  } catch {
    return { success: false, error: "Report não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.config !== undefined) update.config = parsed.data.config;

  const supabase = await createClient();
  const { error } = await supabase.from("reports").update(update).eq("id", parsed.data.reportId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o report." };
  }

  revalidatePath("/reports");
  revalidatePath(`/reports/${parsed.data.reportId}`);
  return { success: true, reportId: parsed.data.reportId };
}

export async function deleteReport(input: DeleteReportInput): Promise<ActionResult> {
  const parsed = deleteReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requireReportManager(parsed.data.reportId);
  } catch {
    return { success: false, error: "Report não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reports").delete().eq("id", parsed.data.reportId);

  if (error) {
    return { success: false, error: "Não foi possível excluir o report." };
  }

  revalidatePath("/reports");
  return { success: true };
}

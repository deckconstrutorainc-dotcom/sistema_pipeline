"use server";

import { requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createPhaseSchema,
  deletePhaseSchema,
  reorderPhasesSchema,
  updatePhaseSchema,
  type CreatePhaseInput,
  type DeletePhaseInput,
  type ReorderPhasesInput,
  type UpdatePhaseInput,
} from "@/lib/validation/phases";

export interface ActionResult {
  success: boolean;
  error?: string;
}

async function requirePipeManager(pipeId: string): Promise<{ organizationId: string }> {
  const supabase = await createClient();
  const { data: pipe } = await supabase
    .from("pipes")
    .select("organization_id")
    .eq("id", pipeId)
    .maybeSingle<{ organization_id: string }>();

  if (!pipe) {
    throw new Error("Pipe não encontrado.");
  }
  await requireOrgRole(pipe.organization_id, ["super_admin", "admin"]);
  return { organizationId: pipe.organization_id };
}

export async function createPhase(input: CreatePhaseInput): Promise<ActionResult> {
  const parsed = createPhaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();

  const { data: maxPositionRow } = await supabase
    .from("phases")
    .select("position")
    .eq("pipe_id", parsed.data.pipeId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();

  const nextPosition = (maxPositionRow?.position ?? -1) + 1;

  const { error } = await supabase.from("phases").insert({
    pipe_id: parsed.data.pipeId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    position: nextPosition,
    is_initial: parsed.data.isInitial,
    is_final: parsed.data.isFinal,
    sla_hours: parsed.data.slaHours ?? null,
  });

  if (error) {
    return { success: false, error: "Não foi possível criar a fase." };
  }

  return { success: true };
}

export async function updatePhase(input: UpdatePhaseInput): Promise<ActionResult> {
  const parsed = updatePhaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.isInitial !== undefined) update.is_initial = parsed.data.isInitial;
  if (parsed.data.isFinal !== undefined) update.is_final = parsed.data.isFinal;
  if (parsed.data.slaHours !== undefined) update.sla_hours = parsed.data.slaHours;

  const supabase = await createClient();
  const { error } = await supabase
    .from("phases")
    .update(update)
    .eq("id", parsed.data.phaseId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar a fase." };
  }

  return { success: true };
}

/** Reordena as fases de um pipe (atualiza `position` de cada uma). */
export async function reorderPhases(input: ReorderPhasesInput): Promise<ActionResult> {
  const parsed = reorderPhasesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();

  const results = await Promise.all(
    parsed.data.orderedPhaseIds.map((phaseId, index) =>
      supabase
        .from("phases")
        .update({ position: index })
        .eq("id", phaseId)
        .eq("pipe_id", parsed.data.pipeId),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed) {
    return { success: false, error: "Não foi possível reordenar as fases." };
  }

  return { success: true };
}

/**
 * Exclui uma fase. Fases com cards não podem ser excluídas — a FK
 * `cards.current_phase_id ... on delete restrict` garante isso no banco;
 * aqui apenas traduzimos o erro de FK em uma mensagem amigável, sem
 * duplicar a regra de negócio no cliente (fonte de verdade é o banco).
 */
export async function deletePhase(input: DeletePhaseInput): Promise<ActionResult> {
  const parsed = deletePhaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("phases")
    .delete()
    .eq("id", parsed.data.phaseId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: "Não é possível excluir uma fase que ainda possui cards. Mova os cards antes de excluir.",
      };
    }
    return { success: false, error: "Não foi possível excluir a fase." };
  }

  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createAutomationSchema,
  toggleAutomationSchema,
  updateAutomationSchema,
  type CreateAutomationInput,
  type ToggleAutomationInput,
  type UpdateAutomationInput,
} from "@/lib/validation/automations";

export interface ActionResult {
  success: boolean;
  error?: string;
  automationId?: string;
}

async function requirePipeManager(pipeId: string): Promise<void> {
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
}

/**
 * Cria uma automação (CLAUDE.md §11). Autorização: somente quem gerencia a
 * estrutura do pipe (`can_manage_pipe_structure`, mesma regra de criar
 * fase/campo) — reforçada aqui no servidor E pela policy `automations_insert`
 * (RLS), nunca só no client (CLAUDE.md §13/§14).
 */
export async function createAutomation(input: CreateAutomationInput): Promise<ActionResult> {
  const parsed = createAutomationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  try {
    await requirePipeManager(parsed.data.pipeId);
  } catch {
    return { success: false, error: "Pipe não encontrado ou sem permissão." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automations")
    .insert({
      pipe_id: parsed.data.pipeId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      trigger_event: parsed.data.triggerEvent,
      conditions: parsed.data.conditions,
      actions: parsed.data.actions,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar a automação." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/automations`);
  return { success: true, automationId: (data as { id: string }).id };
}

export async function updateAutomation(input: UpdateAutomationInput): Promise<ActionResult> {
  const parsed = updateAutomationSchema.safeParse(input);
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
  if (parsed.data.triggerEvent !== undefined) update.trigger_event = parsed.data.triggerEvent;
  if (parsed.data.conditions !== undefined) update.conditions = parsed.data.conditions;
  if (parsed.data.actions !== undefined) update.actions = parsed.data.actions;

  const supabase = await createClient();
  const { error } = await supabase
    .from("automations")
    .update(update)
    .eq("id", parsed.data.automationId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar a automação." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/automations`);
  return { success: true };
}

/** Ativa/desativa uma automação. Nunca é excluída via client (CLAUDE.md §22). */
export async function toggleAutomation(input: ToggleAutomationInput): Promise<ActionResult> {
  const parsed = toggleAutomationSchema.safeParse(input);
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
    .from("automations")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.automationId)
    .eq("pipe_id", parsed.data.pipeId);

  if (error) {
    return { success: false, error: "Não foi possível alterar o status da automação." };
  }

  revalidatePath(`/pipes/${parsed.data.pipeId}/automations`);
  return { success: true };
}

export interface AutomationSummary {
  id: string;
  pipeId: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  conditions: unknown[];
  actions: unknown[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lista as automações de um pipe. A policy `automations_select` (RLS) já
 * garante que só retorna algo se o usuário for membro do pipe — mesma
 * postura de segurança de `getPipeBoardData` (sem distinguir "não existe"
 * de "sem permissão" na resposta ao client).
 */
export async function listAutomations(pipeId: string): Promise<AutomationSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automations")
    .select("id, pipe_id, name, description, trigger_event, conditions, actions, is_active, created_at, updated_at")
    .eq("pipe_id", pipeId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      pipe_id: string;
      name: string;
      description: string | null;
      trigger_event: string;
      conditions: unknown[];
      actions: unknown[];
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    pipeId: row.pipe_id,
    name: row.name,
    description: row.description,
    triggerEvent: row.trigger_event,
    conditions: row.conditions ?? [],
    actions: row.actions ?? [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export interface AutomationRunSummary {
  id: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/**
 * Histórico de execuções de uma automação (CLAUDE.md §11 "status de
 * execução" / §18 auditoria). A policy `automation_runs_select` (RLS)
 * restringe a leitura a quem gerencia a automação (`can_manage_pipe_structure`).
 */
export async function listAutomationRuns(automationId: string): Promise<AutomationRunSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("automation_runs")
    .select("id, status, attempt, max_attempts, error_message, started_at, finished_at, created_at")
    .eq("automation_id", automationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      status: string;
      attempt: number;
      max_attempts: number;
      error_message: string | null;
      started_at: string | null;
      finished_at: string | null;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }));
}

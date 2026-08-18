"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  assignTaskSchema,
  createTaskSchema,
  updateTaskStatusSchema,
  type AssignTaskInput,
  type CreateTaskInput,
  type UpdateTaskStatusInput,
} from "@/lib/validation/tasks";

export interface ActionResult {
  success: boolean;
  error?: string;
  taskId?: string;
}

export interface TaskSummary {
  id: string;
  organizationId: string;
  cardId: string | null;
  pipeId: string | null;
  title: string;
  description: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: parsed.data.organizationId,
      card_id: parsed.data.cardId ?? null,
      pipe_id: parsed.data.pipeId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      assigned_to: parsed.data.assignedTo ?? null,
      due_date: parsed.data.dueDate ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar a tarefa." };
  }

  revalidatePath("/tasks");
  return { success: true, taskId: (data as { id: string }).id };
}

export async function updateTaskStatus(input: UpdateTaskStatusInput): Promise<ActionResult> {
  const parsed = updateTaskStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.taskId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o status da tarefa." };
  }

  revalidatePath("/tasks");
  return { success: true, taskId: parsed.data.taskId };
}

export async function assignTask(input: AssignTaskInput): Promise<ActionResult> {
  const parsed = assignTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({ assigned_to: parsed.data.assignedTo })
    .eq("id", parsed.data.taskId);

  if (error) {
    return { success: false, error: "Não foi possível atribuir a tarefa." };
  }

  revalidatePath("/tasks");
  return { success: true, taskId: parsed.data.taskId };
}

/**
 * Lista as tarefas visíveis ao usuário autenticado na organização ativa
 * (RLS decide o subconjunto real — `tasks_select`: tarefas sem pipe
 * pertencem à organização, tarefas com pipe respeitam `is_pipe_member`).
 */
export async function listTasks(organizationId: string): Promise<TaskSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, organization_id, card_id, pipe_id, title, description, assigned_to, due_date, status, created_by, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      organization_id: string;
      card_id: string | null;
      pipe_id: string | null;
      title: string;
      description: string | null;
      assigned_to: string | null;
      due_date: string | null;
      status: "open" | "in_progress" | "done" | "cancelled";
      created_by: string;
      created_at: string;
      updated_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    cardId: row.card_id,
    pipeId: row.pipe_id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

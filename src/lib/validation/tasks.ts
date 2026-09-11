import { z } from "zod";

export const taskStatusValues = ["open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof taskStatusValues)[number];

export const createTaskSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  cardId: z.string().uuid("Card inválido.").optional(),
  pipeId: z.string().uuid("Pipe inválido.").optional(),
  title: z.string().trim().min(1, "Informe o título da tarefa.").max(200, "Título muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  assignedTo: z.string().uuid("Responsável inválido.").optional(),
  dueDate: z.string().datetime().optional().nullable(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid("Tarefa inválida."),
  status: z.enum(taskStatusValues),
});
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const assignTaskSchema = z.object({
  taskId: z.string().uuid("Tarefa inválida."),
  assignedTo: z.string().uuid("Responsável inválido.").nullable(),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

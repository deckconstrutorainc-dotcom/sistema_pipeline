import { CreateTaskForm } from "@/components/forms/create-task-form";
import { TaskStatusSelect } from "@/components/forms/task-status-select";
import { Badge } from "@/components/ui/badge";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getDueStatus } from "@/lib/validation/cards";
import { listTasks } from "@/server/actions/tasks";

export default async function TasksPage() {
  const organization = await requireActiveOrganization();
  const tasks = await listTasks(organization.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground">
          Tarefas internas da organização, opcionalmente ligadas a um card ou pipe.
        </p>
      </div>

      <CreateTaskForm organizationId={organization.id} />

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma tarefa criada ainda.
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const dueStatus = getDueStatus(task.dueDate);
            return (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <p className="font-medium">{task.title}</p>
                  {task.description ? (
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {task.cardId ? <span>Card: {task.cardId}</span> : null}
                    {task.assignedTo ? <span>Responsável: {task.assignedTo}</span> : null}
                    {dueStatus === "overdue" || dueStatus === "due_soon" ? (
                      <Badge variant={dueStatus === "overdue" ? "destructive" : "warning"}>
                        {dueStatus === "overdue" ? "Atrasada" : "Vence em breve"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <TaskStatusSelect taskId={task.id} status={task.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

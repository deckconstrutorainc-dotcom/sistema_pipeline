"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateTaskStatus } from "@/server/actions/tasks";
import { taskStatusValues, type TaskStatus } from "@/lib/validation/tasks";

interface TaskStatusSelectProps {
  taskId: string;
  status: TaskStatus;
}

const statusLabels: Record<TaskStatus, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  done: "Concluída",
  cancelled: "Cancelada",
};

export function TaskStatusSelect({ taskId, status }: TaskStatusSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (nextStatus: TaskStatus) => {
    setError(null);
    startTransition(async () => {
      const result = await updateTaskStatus({ taskId, status: nextStatus });
      if (!result.success) {
        setError(result.error ?? "Não foi possível atualizar o status.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={status}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value as TaskStatus)}
      >
        {taskStatusValues.map((value) => (
          <option key={value} value={value}>
            {statusLabels[value]}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validation/tasks";
import { createTask } from "@/server/actions/tasks";

interface CreateTaskFormProps {
  organizationId: string;
}

export function CreateTaskForm({ organizationId }: CreateTaskFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { organizationId, title: "" },
  });

  const onSubmit = async (values: CreateTaskInput) => {
    setFormError(null);
    const result = await createTask(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar a tarefa.");
      return;
    }
    reset({ organizationId, title: "" });
    router.refresh();
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="task-title">Nova tarefa</Label>
        <Input id="task-title" placeholder="Título da tarefa" {...register("title")} />
        {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Adicionar tarefa"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

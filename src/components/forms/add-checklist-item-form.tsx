"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { addChecklistItem } from "@/server/actions/checklists";
import { addChecklistItemSchema, type AddChecklistItemInput } from "@/lib/validation/checklists";

interface AddChecklistItemFormProps {
  cardId: string;
  pipeId: string;
}

export function AddChecklistItemForm({ cardId, pipeId }: AddChecklistItemFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddChecklistItemInput>({
    resolver: zodResolver(addChecklistItemSchema),
    defaultValues: { cardId, pipeId, title: "" },
  });

  const onSubmit = async (values: AddChecklistItemInput) => {
    setFormError(null);
    const result = await addChecklistItem(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível adicionar o item.");
      return;
    }
    reset({ cardId, pipeId, title: "" });
    router.refresh();
  };

  return (
    <form className="flex items-start gap-2" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("cardId")} />
      <input type="hidden" {...register("pipeId")} />
      <div className="flex-1 space-y-1">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Adicionar item ao checklist..."
          {...register("title")}
        />
        {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      </div>
      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? "Adicionando..." : "Adicionar"}
      </Button>
    </form>
  );
}

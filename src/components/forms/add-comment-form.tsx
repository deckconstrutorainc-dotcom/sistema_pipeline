"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { addComment } from "@/server/actions/cards";
import { addCommentSchema, type AddCommentInput } from "@/lib/validation/cards";

interface AddCommentFormProps {
  cardId: string;
  pipeId: string;
}

export function AddCommentForm({ cardId, pipeId }: AddCommentFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddCommentInput>({
    resolver: zodResolver(addCommentSchema),
    defaultValues: { cardId, pipeId, body: "" },
  });

  const onSubmit = async (values: AddCommentInput) => {
    setFormError(null);
    const result = await addComment(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível adicionar o comentário.");
      return;
    }
    reset({ cardId, pipeId, body: "" });
    router.refresh();
  };

  return (
    <form className="space-y-2" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("cardId")} />
      <input type="hidden" {...register("pipeId")} />
      <textarea
        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Escreva um comentário..."
        {...register("body")}
      />
      {errors.body ? <p className="text-sm text-destructive">{errors.body.message}</p> : null}
      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : "Comentar"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

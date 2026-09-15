"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
      <Textarea
        className="min-h-20"
        placeholder="Escreva um comentário… use @nome para avisar alguém"
        {...register("body")}
      />
      {errors.body ? <p className="text-ui-xs text-destructive">{errors.body.message}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Enviando..." : "Comentar"}
        </Button>
        <span className="text-ui-2xs text-muted-foreground">
          <strong className="font-medium">@nome</strong> notifica a pessoa
        </span>
      </div>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

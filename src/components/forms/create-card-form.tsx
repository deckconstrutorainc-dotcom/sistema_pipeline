"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCard } from "@/server/actions/cards";
import { createCardSchema, type CreateCardInput } from "@/lib/validation/cards";

interface CreateCardFormProps {
  pipeId: string;
}

export function CreateCardForm({ pipeId }: CreateCardFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCardInput>({
    resolver: zodResolver(createCardSchema),
    defaultValues: { pipeId, title: "" },
  });

  const onSubmit = async (values: CreateCardInput) => {
    setFormError(null);
    const result = await createCard(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o card.");
      return;
    }
    reset({ pipeId, title: "" });
    router.refresh();
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("pipeId")} />

      <div className="space-y-1">
        <Label htmlFor="card-title">Novo card</Label>
        <Input id="card-title" placeholder="Título do card" {...register("title")} />
        {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Adicionar card"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

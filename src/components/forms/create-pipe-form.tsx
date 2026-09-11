"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPipe } from "@/server/actions/pipes";
import { createPipeSchema, type CreatePipeInput } from "@/lib/validation/pipes";

interface CreatePipeFormProps {
  organizationId: string;
}

export function CreatePipeForm({ organizationId }: CreatePipeFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreatePipeInput>({
    resolver: zodResolver(createPipeSchema),
    defaultValues: { organizationId, name: "", isRestricted: false },
  });

  const onSubmit = async (values: CreatePipeInput) => {
    setFormError(null);
    const result = await createPipe(values);
    // Em caso de sucesso, createPipe() redireciona (não retorna). Se
    // chegarmos aqui, foi porque houve um erro tratado.
    if (result && !result.success) {
      setFormError(result.error ?? "Não foi possível criar o pipe.");
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="pipe-name">Nome do pipe</Label>
        <Input id="pipe-name" placeholder="Ex.: Gestão de Contratos" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar pipe"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

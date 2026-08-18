"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDatabaseSchema, type CreateDatabaseInput } from "@/lib/validation/databases";
import { createDatabase } from "@/server/actions/databases";

interface CreateDatabaseFormProps {
  organizationId: string;
}

export function CreateDatabaseForm({ organizationId }: CreateDatabaseFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDatabaseInput>({
    resolver: zodResolver(createDatabaseSchema),
    defaultValues: { organizationId, name: "" },
  });

  const onSubmit = async (values: CreateDatabaseInput) => {
    setFormError(null);
    const result = await createDatabase(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o database.");
      return;
    }
    reset({ organizationId, name: "" });
    if (result.databaseId) {
      router.push(`/databases/${result.databaseId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="database-name">Nome do database</Label>
        <Input id="database-name" placeholder="Ex.: Fornecedores" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar database"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

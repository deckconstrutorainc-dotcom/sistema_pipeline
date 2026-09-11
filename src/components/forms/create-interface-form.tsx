"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInterfaceSchema, type CreateInterfaceInput } from "@/lib/validation/interfaces";
import { createInterface } from "@/server/actions/interfaces";

interface CreateInterfaceFormProps {
  organizationId: string;
}

export function CreateInterfaceForm({ organizationId }: CreateInterfaceFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateInterfaceInput>({
    resolver: zodResolver(createInterfaceSchema),
    defaultValues: { organizationId, name: "", slug: "" },
  });

  const onSubmit = async (values: CreateInterfaceInput) => {
    setFormError(null);
    const result = await createInterface(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar a interface.");
      return;
    }
    reset({ organizationId, name: "", slug: "" });
    if (result.interfaceId) {
      router.push(`/interfaces/${result.interfaceId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="interface-name">Nome da interface</Label>
        <Input id="interface-name" placeholder="Ex.: Painel do time" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="interface-slug">Identificador (slug)</Label>
        <Input id="interface-slug" placeholder="Ex.: painel-time" {...register("slug")} />
        {errors.slug ? <p className="text-sm text-destructive">{errors.slug.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar interface"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

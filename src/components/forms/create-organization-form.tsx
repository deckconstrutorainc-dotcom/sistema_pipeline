"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "@/server/actions/organizations";
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from "@/lib/validation/organizations";

const DIACRITICS_REGEX = /[̀-ͯ]/g;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateOrganizationForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "" },
  });

  const onSubmit = async (values: CreateOrganizationInput) => {
    setFormError(null);
    const result = await createOrganization(values);
    if (result && !result.success) {
      setFormError(result.error ?? "Não foi possível criar a organização.");
    }
    // Em caso de sucesso a server action redireciona para /dashboard.
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Nome da organização</Label>
        <Input
          id="name"
          placeholder="Minha Empresa"
          {...register("name", {
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              if (!dirtyFields.slug) {
                setValue("slug", slugify(event.target.value), { shouldValidate: true });
              }
            },
          })}
        />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Identificador</Label>
        <Input id="slug" placeholder="minha-empresa" {...register("slug")} />
        {errors.slug ? <p className="text-sm text-destructive">{errors.slug.message}</p> : null}
        <p className="text-xs text-muted-foreground">
          Usado em URLs. Pode ser ajustado: {getValues("slug") || "minha-empresa"}
        </p>
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Criando organização..." : "Criar organização"}
      </Button>
    </form>
  );
}

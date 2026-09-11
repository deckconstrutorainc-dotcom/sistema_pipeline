"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDatabaseFieldSchema,
  databaseFieldTypes,
  optionBasedFieldTypes,
  type CreateDatabaseFieldInput,
} from "@/lib/validation/databases";
import { createDatabaseField } from "@/server/actions/databases";

const fieldTypeLabels: Record<(typeof databaseFieldTypes)[number], string> = {
  short_text: "Texto curto",
  long_text: "Texto longo",
  number: "Número",
  currency: "Moeda",
  date: "Data",
  datetime: "Data/hora",
  single_select: "Seleção única",
  multi_select: "Seleção múltipla",
  checkbox: "Checkbox",
  email: "E-mail",
  phone: "Telefone",
  user: "Usuário",
  attachment: "Anexo",
};

interface CreateDatabaseFieldFormProps {
  databaseId: string;
}

/** Opções de seleção informadas como uma por linha, no formato `valor|rótulo`. */
function parseOptionsText(text: string): { value: string; label: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("|").map((part) => part.trim());
      return { value: value || line, label: label || value || line };
    });
}

export function CreateDatabaseFieldForm({ databaseId }: CreateDatabaseFieldFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [optionsText, setOptionsText] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDatabaseFieldInput>({
    resolver: zodResolver(createDatabaseFieldSchema),
    defaultValues: { databaseId, label: "", key: "", type: "short_text", isRequired: false },
  });

  const selectedType = watch("type");
  const needsOptions = optionBasedFieldTypes.includes(selectedType);

  const onSubmit = async (values: CreateDatabaseFieldInput) => {
    setFormError(null);
    const payload: CreateDatabaseFieldInput = {
      ...values,
      options: needsOptions ? parseOptionsText(optionsText) : undefined,
    };
    const result = await createDatabaseField(payload);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o campo.");
      return;
    }
    reset({ databaseId, label: "", key: "", type: "short_text", isRequired: false });
    setOptionsText("");
    router.refresh();
  };

  return (
    <form className="space-y-3 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("databaseId")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="field-label">Rótulo</Label>
          <Input id="field-label" placeholder="Ex.: Razão social" {...register("label")} />
          {errors.label ? <p className="text-sm text-destructive">{errors.label.message}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="field-key">Chave</Label>
          <Input id="field-key" placeholder="Ex.: razao_social" {...register("key")} />
          {errors.key ? <p className="text-sm text-destructive">{errors.key.message}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="field-type">Tipo</Label>
          <select
            id="field-type"
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            {...register("type")}
          >
            {databaseFieldTypes.map((type) => (
              <option key={type} value={type}>
                {fieldTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input id="field-required" type="checkbox" {...register("isRequired")} />
          <Label htmlFor="field-required">Obrigatório</Label>
        </div>
      </div>

      {needsOptions ? (
        <div className="space-y-1">
          <Label htmlFor="field-options">Opções (uma por linha, formato valor|rótulo)</Label>
          <textarea
            id="field-options"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={"ativo|Ativo\ninativo|Inativo"}
            value={optionsText}
            onChange={(event) => setOptionsText(event.target.value)}
          />
          {errors.options ? <p className="text-sm text-destructive">{errors.options.message}</p> : null}
        </div>
      ) : null}

      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? "Adicionando..." : "Adicionar campo"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

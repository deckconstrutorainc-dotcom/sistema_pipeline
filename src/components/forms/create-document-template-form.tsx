"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDocumentTemplateSchema,
  type CreateDocumentTemplateInput,
} from "@/lib/validation/documents";
import { createDocumentTemplate } from "@/server/actions/documents";

interface CreateDocumentTemplateFormProps {
  organizationId: string;
  pipeId: string;
}

export function CreateDocumentTemplateForm({ organizationId, pipeId }: CreateDocumentTemplateFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDocumentTemplateInput>({
    resolver: zodResolver(createDocumentTemplateSchema),
    defaultValues: {
      organizationId,
      pipeId,
      name: "",
      body: "<p>Prezado(a),</p>\n<p>Referente ao card {{card.title}} (#{{card.number}}).</p>",
    },
  });

  const onSubmit = async (values: CreateDocumentTemplateInput) => {
    setFormError(null);
    const result = await createDocumentTemplate(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o template.");
      return;
    }
    reset({ organizationId, pipeId, name: "", body: "" });
    router.refresh();
  };

  return (
    <form className="space-y-3 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />
      <input type="hidden" {...register("pipeId")} />

      <div className="space-y-1">
        <Label htmlFor="template-name">Nome do template</Label>
        <Input id="template-name" placeholder="Ex.: Ofício de encerramento" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="template-body">
          Conteúdo (HTML) — use placeholders como <code>{"{{card.title}}"}</code>,{" "}
          <code>{"{{card.number}}"}</code>, <code>{"{{field.chave_do_campo}}"}</code>
        </Label>
        <textarea
          id="template-body"
          rows={8}
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-sm"
          {...register("body")}
        />
        {errors.body ? <p className="text-sm text-destructive">{errors.body.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar template"}
      </Button>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

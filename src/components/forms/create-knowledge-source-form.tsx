"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createKnowledgeSourceSchema, type CreateKnowledgeSourceInput } from "@/lib/validation/ai";
import { createKnowledgeSource } from "@/server/actions/knowledge-sources";

interface CreateKnowledgeSourceFormProps {
  organizationId: string;
  agents: { id: string; name: string }[];
}

/**
 * Formulário de criação de fonte de conhecimento (CLAUDE.md §17 "knowledge
 * base"). Nesta primeira versão só `manual_text` (texto colado direto) tem
 * um caminho de criação via UI — busca por texto simples, não semântica
 * (ver `ai-run-engine.ts`).
 */
export function CreateKnowledgeSourceForm({ organizationId, agents }: CreateKnowledgeSourceFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateKnowledgeSourceInput>({
    resolver: zodResolver(createKnowledgeSourceSchema),
    defaultValues: {
      organizationId,
      aiAgentId: undefined,
      name: "",
      sourceType: "manual_text",
      content: "",
    },
  });

  const onSubmit = async (values: CreateKnowledgeSourceInput) => {
    setFormError(null);
    const result = await createKnowledgeSource({ ...values, aiAgentId: values.aiAgentId || undefined });
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar a fonte de conhecimento.");
      return;
    }
    reset({ organizationId, aiAgentId: undefined, name: "", sourceType: "manual_text", content: "" });
    router.refresh();
  };

  return (
    <form className="space-y-3 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />
      <input type="hidden" value="manual_text" {...register("sourceType")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="knowledge-name">Nome da fonte</Label>
          <Input id="knowledge-name" placeholder="Ex.: Política de contratos v2" {...register("name")} />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="knowledge-agent">Agente (opcional)</Label>
          <select
            id="knowledge-agent"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            {...register("aiAgentId")}
          >
            <option value="">Disponível para qualquer agente</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="knowledge-content">Conteúdo (texto)</Label>
        <textarea
          id="knowledge-content"
          rows={5}
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
          placeholder="Cole aqui o texto que servirá de contexto (busca textual simples, não semântica)."
          {...register("content")}
        />
        {errors.content ? <p className="text-sm text-destructive">{errors.content.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Adicionando..." : "Adicionar fonte de conhecimento"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

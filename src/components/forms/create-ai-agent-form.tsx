"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TOOL_CATALOG } from "@/lib/ai/tool-catalog";
import { createAiAgentSchema, type CreateAiAgentInput } from "@/lib/validation/ai";
import { createAiAgent } from "@/server/actions/ai-agents";

const criticalityLabels: Record<string, string> = {
  read: "leitura",
  write: "escrita",
  critical: "crítica",
};

interface CreateAiAgentFormProps {
  organizationId: string;
  pipes: { id: string; name: string }[];
}

/**
 * Formulário de criação de agente de IA (CLAUDE.md §17, M8). A allowlist de
 * tools é sempre escolhida explicitamente via checkboxes a partir do
 * catálogo real (`TOOL_CATALOG`) — nunca existe uma opção de "marcar
 * todas"/"acesso irrestrito", reforçando na própria UI que a allowlist é
 * deliberada (CLAUDE.md §3.27/§3.28).
 */
export function CreateAiAgentForm({ organizationId, pipes }: CreateAiAgentFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateAiAgentInput>({
    resolver: zodResolver(createAiAgentSchema),
    defaultValues: {
      organizationId,
      name: "",
      description: "",
      instructions: "",
      allowedTools: [],
      pipeId: undefined,
      requiresApproval: true,
    },
  });

  const allowedTools = watch("allowedTools") ?? [];

  const toggleTool = (toolName: string, checked: boolean) => {
    const next = checked ? [...allowedTools, toolName] : allowedTools.filter((t) => t !== toolName);
    setValue("allowedTools", next, { shouldValidate: true });
  };

  const onSubmit = async (values: CreateAiAgentInput) => {
    setFormError(null);
    const result = await createAiAgent({
      ...values,
      description: values.description?.trim() ? values.description : undefined,
      pipeId: values.pipeId || undefined,
    });
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o agente.");
      return;
    }
    reset({
      organizationId,
      name: "",
      description: "",
      instructions: "",
      allowedTools: [],
      pipeId: undefined,
      requiresApproval: true,
    });
    router.refresh();
  };

  return (
    <form className="space-y-4 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="agent-name">Nome do agente</Label>
          <Input id="agent-name" placeholder="Ex.: Assistente de Contratos" {...register("name")} />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="agent-pipe">Escopo (opcional)</Label>
          <select
            id="agent-pipe"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            {...register("pipeId")}
          >
            <option value="">Toda a organização</option>
            {pipes.map((pipe) => (
              <option key={pipe.id} value={pipe.id}>
                {pipe.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="agent-description">Descrição (opcional)</Label>
        <Input id="agent-description" placeholder="Para que serve este agente" {...register("description")} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="agent-instructions">Instruções (system prompt)</Label>
        <textarea
          id="agent-instructions"
          rows={5}
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
          placeholder="Ex.: Você é um assistente que resume cards de contratos e sugere labels de risco."
          {...register("instructions")}
        />
        {errors.instructions ? <p className="text-sm text-destructive">{errors.instructions.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label>Tools autorizadas (allowlist)</Label>
        <p className="text-xs text-muted-foreground">
          O agente NUNCA pode chamar uma tool fora desta lista — mesmo que o modelo peça, a execução é rejeitada
          pelo servidor.
        </p>
        <div className="space-y-1.5">
          {TOOL_CATALOG.map((tool) => (
            <label key={tool.name} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={allowedTools.includes(tool.name)}
                onChange={(event) => toggleTool(tool.name, event.target.checked)}
              />
              <span>
                <span className="font-medium">{tool.name}</span>{" "}
                <span className="text-xs text-muted-foreground">({criticalityLabels[tool.criticality]})</span>
                <br />
                <span className="text-xs text-muted-foreground">{tool.description}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.allowedTools ? <p className="text-sm text-destructive">{errors.allowedTools.message}</p> : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("requiresApproval")} defaultChecked />
        Exigir aprovação humana antes de executar tools críticas
      </label>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar agente"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

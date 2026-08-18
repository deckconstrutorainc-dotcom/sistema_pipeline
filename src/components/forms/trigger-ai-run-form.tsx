"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { triggerAiRun } from "@/server/actions/ai-runs";

interface TriggerAiRunFormProps {
  cardId: string;
  agents: { id: string; name: string }[];
}

interface FormValues {
  agentId: string;
  instruction: string;
}

/**
 * "Assistente de IA" na página do card (CLAUDE.md §22 M8) — dado um card e
 * uma instrução do usuário, dispara um `ai_run` manual. A execução em si é
 * assíncrona (fila `jobs` + `POST /api/ai/process`); esta ação só confirma
 * que a run foi criada, não espera o resultado.
 */
export function TriggerAiRunForm({ cardId, agents }: TriggerAiRunFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { agentId: agents[0]?.id ?? "", instruction: "" },
  });

  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum agente de IA disponível para este pipe. Configure um em Settings → Agentes de IA.
      </p>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    setSuccessMessage(null);

    if (!values.agentId) {
      setFormError("Selecione um agente.");
      return;
    }
    if (!values.instruction.trim()) {
      setFormError("Descreva o que a IA deve fazer.");
      return;
    }

    const result = await triggerAiRun({ agentId: values.agentId, cardId, instruction: values.instruction });
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível disparar a execução.");
      return;
    }

    setSuccessMessage("Execução disparada — acompanhe o progresso em Execuções de IA.");
    reset({ agentId: values.agentId, instruction: "" });
    router.refresh();
  };

  return (
    <form className="space-y-3 rounded-lg border p-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1">
        <Label htmlFor="ai-run-agent">Agente</Label>
        <select
          id="ai-run-agent"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          {...register("agentId")}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ai-run-instruction">Instrução</Label>
        <textarea
          id="ai-run-instruction"
          rows={3}
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
          placeholder="Ex.: Resuma este card e sugira uma label de prioridade."
          {...register("instruction")}
        />
      </div>

      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? "Disparando..." : "Disparar assistente de IA"}
      </Button>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}
    </form>
  );
}

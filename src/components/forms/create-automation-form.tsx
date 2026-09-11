"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAutomation } from "@/server/actions/automations";
import {
  actionTypes,
  conditionOperators,
  triggerEvents,
  type ActionType,
  type ConditionOperator,
  type TriggerEvent,
} from "@/lib/validation/automations";

const triggerEventLabels: Record<TriggerEvent, string> = {
  "card.created": "Card criado",
  "card.moved": "Card movido de fase",
  "card.field.updated": "Campo do card atualizado",
  "card.overdue": "Card atrasado (prazo vencido)",
  "phase.sla.exceeded": "SLA da fase excedido",
};

const conditionOperatorLabels: Record<ConditionOperator, string> = {
  equals: "é igual a",
  not_equals: "é diferente de",
  contains: "contém",
  empty: "está vazio",
  not_empty: "não está vazio",
  greater_than: "é maior que",
  less_than: "é menor que",
};

const actionTypeLabels: Record<ActionType, string> = {
  move_card: "Mover card de fase",
  update_field: "Atualizar campo",
  assign_user: "Atribuir responsável",
  add_label: "Aplicar label",
  send_notification: "Enviar notificação",
};

const actionParamsHint: Record<ActionType, string> = {
  move_card: '{"targetPhaseId": "<uuid da fase>"}',
  update_field: '{"fieldId": "<uuid do campo>", "value": "<novo valor>"}',
  assign_user: '{"userId": "<uuid do usuário>"}',
  add_label: '{"labelId": "<uuid da label>"}',
  send_notification: '{"message": "texto da notificação"}',
};

/**
 * Formulário simples de criação de automação (CLAUDE.md §11/§13/§14):
 * trigger (select), condições (lista dinâmica campo/operador/valor) e
 * ações (lista dinâmica tipo + parâmetros em JSON). Deliberadamente não é
 * um builder visual sofisticado — funcional e correto tem prioridade sobre
 * polish, conforme escopo do M3.
 *
 * Os parâmetros de cada ação são digitados como JSON bruto (com um
 * placeholder de exemplo por tipo) em vez de um formulário dedicado por
 * tipo de ação — evita construir 5 sub-formulários diferentes para um
 * builder que ainda vai evoluir em milestones futuros.
 */
const formSchema = z.object({
  pipeId: z.string().uuid(),
  name: z.string().trim().min(1, "Informe o nome da automação.").max(120),
  description: z.string().trim().max(500).optional(),
  triggerEvent: z.enum(triggerEvents),
  conditions: z.array(
    z.object({
      field: z.string().trim().min(1, "Informe o campo."),
      operator: z.enum(conditionOperators),
      value: z.string().optional(),
    }),
  ),
  actions: z
    .array(
      z.object({
        type: z.enum(actionTypes),
        paramsJson: z.string().trim().min(2, "Informe os parâmetros em JSON (ex.: {}).") ,
      }),
    )
    .min(1, "Configure ao menos uma ação."),
});
type FormValues = z.infer<typeof formSchema>;

interface CreateAutomationFormProps {
  pipeId: string;
}

export function CreateAutomationForm({ pipeId }: CreateAutomationFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pipeId,
      name: "",
      triggerEvent: "card.created",
      conditions: [],
      actions: [{ type: "send_notification", paramsJson: actionParamsHint.send_notification }],
    },
  });

  const conditionsArray = useFieldArray({ control, name: "conditions" });
  const actionsArray = useFieldArray({ control, name: "actions" });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);

    let parsedActions: { type: ActionType; params: Record<string, unknown> }[];
    try {
      parsedActions = values.actions.map((action) => {
        const params = JSON.parse(action.paramsJson) as Record<string, unknown>;
        return { type: action.type, params };
      });
    } catch {
      setFormError("Um dos parâmetros de ação não é um JSON válido.");
      return;
    }

    const result = await createAutomation({
      pipeId: values.pipeId,
      name: values.name,
      description: values.description,
      triggerEvent: values.triggerEvent,
      conditions: values.conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
      })),
      actions: parsedActions,
    });

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar a automação.");
      return;
    }

    reset({
      pipeId,
      name: "",
      triggerEvent: "card.created",
      conditions: [],
      actions: [{ type: "send_notification", paramsJson: actionParamsHint.send_notification }],
    });
    router.refresh();
  };

  return (
    <form className="space-y-4 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("pipeId")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="automation-name">Nome</Label>
          <Input id="automation-name" placeholder="Ex.: Avisar responsável em atraso" {...register("name")} />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="automation-trigger">Quando (evento)</Label>
          <select
            id="automation-trigger"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            {...register("triggerEvent")}
          >
            {triggerEvents.map((event) => (
              <option key={event} value={event}>
                {triggerEventLabels[event]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="automation-description">Descrição (opcional)</Label>
        <textarea
          id="automation-description"
          className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...register("description")}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Condições (opcional — vazio significa &quot;sempre executar&quot;)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => conditionsArray.append({ field: "", operator: "not_empty", value: "" })}
          >
            Adicionar condição
          </Button>
        </div>
        {conditionsArray.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-center gap-2">
            <Input
              className="w-48"
              placeholder="ID do campo (ou __currentPhaseId, __title, __dueDate)"
              {...register(`conditions.${index}.field` as const)}
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              {...register(`conditions.${index}.operator` as const)}
            >
              {conditionOperators.map((op) => (
                <option key={op} value={op}>
                  {conditionOperatorLabels[op]}
                </option>
              ))}
            </select>
            <Input className="w-40" placeholder="valor" {...register(`conditions.${index}.value` as const)} />
            <Button type="button" variant="ghost" size="sm" onClick={() => conditionsArray.remove(index)}>
              Remover
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Ações</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => actionsArray.append({ type: "send_notification", paramsJson: actionParamsHint.send_notification })}
          >
            Adicionar ação
          </Button>
        </div>
        {actionsArray.fields.map((field, index) => (
          <div key={field.id} className="space-y-1 rounded-md border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                {...register(`actions.${index}.type` as const)}
              >
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {actionTypeLabels[type]}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="sm" onClick={() => actionsArray.remove(index)}>
                Remover
              </Button>
            </div>
            <textarea
              className="min-h-14 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Parâmetros em JSON"
              {...register(`actions.${index}.paramsJson` as const)}
            />
            {errors.actions?.[index]?.paramsJson ? (
              <p className="text-sm text-destructive">{errors.actions[index]?.paramsJson?.message}</p>
            ) : null}
          </div>
        ))}
        {errors.actions?.message ? <p className="text-sm text-destructive">{errors.actions.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar automação"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

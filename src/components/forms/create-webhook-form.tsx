"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebhook } from "@/server/actions/webhooks";
import { webhookDirections, webhookEventTypes, type WebhookDirection, type WebhookEventType } from "@/lib/validation/webhooks";

const eventTypeLabels: Record<WebhookEventType, string> = {
  "card.created": "Card criado",
  "card.moved": "Card movido de fase",
  "card.field.updated": "Campo do card atualizado",
  "card.overdue": "Card atrasado (prazo vencido)",
  "phase.sla.exceeded": "SLA da fase excedido",
};

const directionLabels: Record<WebhookDirection, string> = {
  outbound: "Outbound (BTS Pipe envia para uma URL externa)",
  inbound: "Inbound (sistema externo envia para o BTS Pipe)",
};

interface CreateWebhookFormProps {
  organizationId: string;
}

interface FormValues {
  organizationId: string;
  direction: WebhookDirection;
  url: string;
  eventTypes: WebhookEventType[];
  secret: string;
}

/**
 * Formulário de criação de webhook (CLAUDE.md §13/§14/§16). Para
 * `direction = 'inbound'`, a URL de destino não se aplica (o BTS Pipe é
 * quem RECEBE) — a UI mostra a URL de recebimento gerada
 * (`/api/webhooks/inbound/<id>`) só depois de criado, na listagem.
 */
export function CreateWebhookForm({ organizationId }: CreateWebhookFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { organizationId, direction: "outbound", url: "", eventTypes: [], secret: "" },
  });

  const direction = watch("direction");

  const onSubmit = async (values: FormValues) => {
    setFormError(null);

    if (values.eventTypes.length === 0) {
      setFormError("Selecione ao menos um evento.");
      return;
    }
    if (values.direction === "outbound" && !values.url.trim()) {
      setFormError("Informe a URL de destino para um webhook outbound.");
      return;
    }

    const result = await createWebhook({
      organizationId: values.organizationId,
      direction: values.direction,
      url: values.direction === "outbound" ? values.url : undefined,
      eventTypes: values.eventTypes,
      secret: values.secret.trim() ? values.secret : undefined,
    });

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o webhook.");
      return;
    }

    reset({ organizationId, direction: "outbound", url: "", eventTypes: [], secret: "" });
    router.refresh();
  };

  return (
    <form className="space-y-4 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="webhook-direction">Direção</Label>
          <select
            id="webhook-direction"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            {...register("direction")}
          >
            {webhookDirections.map((d) => (
              <option key={d} value={d}>
                {directionLabels[d]}
              </option>
            ))}
          </select>
        </div>

        {direction === "outbound" ? (
          <div className="space-y-1">
            <Label htmlFor="webhook-url">URL de destino</Label>
            <Input id="webhook-url" placeholder="https://exemplo.com/webhook" {...register("url")} />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Eventos</Label>
        <div className="flex flex-wrap gap-3">
          {webhookEventTypes.map((event) => (
            <label key={event} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" value={event} {...register("eventTypes")} />
              {eventTypeLabels[event]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="webhook-secret">
          Segredo (opcional — usado para assinar/validar via HMAC-SHA256, header X-BTS-Signature)
        </Label>
        <Input id="webhook-secret" type="password" autoComplete="off" placeholder="••••••••" {...register("secret")} />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar webhook"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

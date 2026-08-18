import { z } from "zod";

/**
 * Eventos de domínio que um webhook outbound pode assinar. Espelha
 * `public.domain_events.event_type` (M3) — mantido em sincronia manual com
 * `triggerEvents` de `src/lib/validation/automations.ts`, mais o evento
 * sintético `webhook.received` (emitido opcionalmente pela rota inbound —
 * ver `src/app/api/webhooks/inbound/[webhookId]/route.ts`).
 */
export const webhookEventTypes = [
  "card.created",
  "card.moved",
  "card.field.updated",
  "card.overdue",
  "phase.sla.exceeded",
] as const;
export type WebhookEventType = (typeof webhookEventTypes)[number];

export const webhookDirections = ["outbound", "inbound"] as const;
export type WebhookDirection = (typeof webhookDirections)[number];

export const createWebhookSchema = z
  .object({
    organizationId: z.string().uuid("Organização inválida."),
    pipeId: z.string().uuid("Pipe inválido.").optional(),
    direction: z.enum(webhookDirections),
    url: z.string().trim().url("Informe uma URL válida.").optional(),
    eventTypes: z.array(z.enum(webhookEventTypes)).min(1, "Selecione ao menos um evento."),
    secret: z.string().trim().min(8, "O segredo deve ter ao menos 8 caracteres.").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.direction === "outbound" && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe a URL de destino para um webhook outbound.",
        path: ["url"],
      });
    }
  });
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  webhookId: z.string().uuid("Webhook inválido."),
  organizationId: z.string().uuid("Organização inválida."),
  url: z.string().trim().url("Informe uma URL válida.").optional(),
  eventTypes: z.array(z.enum(webhookEventTypes)).min(1, "Selecione ao menos um evento.").optional(),
  secret: z.string().trim().min(8, "O segredo deve ter ao menos 8 caracteres.").optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const toggleWebhookSchema = z.object({
  webhookId: z.string().uuid("Webhook inválido."),
  organizationId: z.string().uuid("Organização inválida."),
  isActive: z.boolean(),
});
export type ToggleWebhookInput = z.infer<typeof toggleWebhookSchema>;

export const listWebhookDeliveriesSchema = z.object({
  webhookId: z.string().uuid("Webhook inválido."),
});
export type ListWebhookDeliveriesInput = z.infer<typeof listWebhookDeliveriesSchema>;

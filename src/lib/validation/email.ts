import { z } from "zod";

export const createEmailTemplateSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  pipeId: z.string().uuid("Pipe inválido.").optional(),
  name: z.string().trim().min(1, "Informe o nome do template.").max(120, "Nome muito longo."),
  subject: z.string().trim().min(1, "Informe o assunto.").max(200, "Assunto muito longo."),
  body: z.string().trim().min(1, "Informe o corpo do e-mail.").max(20000, "Corpo muito longo."),
});
export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;

export const logOutboundEmailSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  threadId: z.string().uuid("Thread inválida.").optional(),
  subject: z.string().trim().min(1, "Informe o assunto.").max(200),
  fromAddress: z.string().trim().email("E-mail de origem inválido."),
  toAddresses: z.array(z.string().trim().email("E-mail de destino inválido.")).min(1, "Informe ao menos um destinatário."),
  body: z.string().trim().min(1, "Informe o corpo do e-mail.").max(20000),
});
export type LogOutboundEmailInput = z.infer<typeof logOutboundEmailSchema>;

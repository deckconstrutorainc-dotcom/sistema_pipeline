import { z } from "zod";

export const createDocumentTemplateSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  pipeId: z.string().uuid("Pipe inválido.").optional().nullable(),
  name: z.string().trim().min(2, "Informe o nome do template.").max(120, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  body: z.string().trim().min(1, "Informe o conteúdo do template."),
});
export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;

export const updateDocumentTemplateSchema = z.object({
  templateId: z.string().uuid("Template inválido."),
  name: z.string().trim().min(2, "Informe o nome do template.").max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  body: z.string().trim().min(1, "Informe o conteúdo do template.").optional(),
});
export type UpdateDocumentTemplateInput = z.infer<typeof updateDocumentTemplateSchema>;

export const generateDocumentSchema = z.object({
  templateId: z.string().uuid("Template inválido."),
  cardId: z.string().uuid("Card inválido."),
});
export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;

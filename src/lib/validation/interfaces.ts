import { z } from "zod";

export const interfaceComponentTypeValues = [
  "dashboard_embed",
  "pipe_view",
  "database_view",
  "text_block",
] as const;
export type InterfaceComponentType = (typeof interfaceComponentTypeValues)[number];

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Informe um identificador.")
  .max(80, "Identificador muito longo.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen.");

export const createInterfaceSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  name: z.string().trim().min(2, "Informe o nome da interface.").max(120, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  slug: slugSchema,
});
export type CreateInterfaceInput = z.infer<typeof createInterfaceSchema>;

export const publishInterfaceSchema = z.object({
  interfaceId: z.string().uuid("Interface inválida."),
  isPublished: z.boolean(),
});
export type PublishInterfaceInput = z.infer<typeof publishInterfaceSchema>;

export const addComponentSchema = z.object({
  interfaceId: z.string().uuid("Interface inválida."),
  componentType: z.enum(interfaceComponentTypeValues),
  config: z.record(z.string(), z.unknown()),
  positionX: z.number().int().min(0).default(0),
  positionY: z.number().int().min(0).default(0),
  width: z.number().int().min(1).max(12).default(6),
  height: z.number().int().min(1).max(12).default(4),
});
export type AddComponentInput = z.infer<typeof addComponentSchema>;

export const updateComponentSchema = z.object({
  componentId: z.string().uuid("Componente inválido."),
  interfaceId: z.string().uuid("Interface inválida."),
  config: z.record(z.string(), z.unknown()).optional(),
  positionX: z.number().int().min(0).optional(),
  positionY: z.number().int().min(0).optional(),
  width: z.number().int().min(1).max(12).optional(),
  height: z.number().int().min(1).max(12).optional(),
});
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;

import { z } from "zod";

import { emailSchema } from "@/lib/validation/auth";

/** Papéis atribuíveis a um membro (o super_admin da org é definido apenas
 * no onboarding via `create_organization_with_owner`; para não permitir
 * que qualquer admin promova alguém a super_admin sem essa via, ele fica
 * de fora das opções de atribuição manual por padrão). */
export const assignableRoleKeys = [
  "admin",
  "member",
  "read_only",
  "restricted",
  "guest",
] as const;
export type AssignableRoleKey = (typeof assignableRoleKeys)[number];

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "O identificador deve ter ao menos 2 caracteres.")
  .max(60, "O identificador deve ter no máximo 60 caracteres.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use apenas letras minúsculas, números e hífens (ex.: minha-empresa).",
  );

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da organização.")
    .max(120, "Nome muito longo."),
  slug: slugSchema,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
});
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;

export const inviteMemberSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  email: emailSchema,
  roleKey: z.enum(assignableRoleKeys),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  membershipId: z.string().uuid("Membro inválido."),
  roleKey: z.enum(assignableRoleKeys),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const removeMemberSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  membershipId: z.string().uuid("Membro inválido."),
});
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

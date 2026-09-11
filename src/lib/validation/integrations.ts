import { z } from "zod";

/**
 * Providers suportados no M7. Espelha exatamente o `check` constraint de
 * `public.integrations.provider` (migration `20260818094400_integrations.sql`)
 * — qualquer novo provider precisa ser adicionado nos dois lugares.
 */
export const integrationProviders = ["http_webhook", "email", "google", "microsoft", "e_signature"] as const;
export type IntegrationProvider = (typeof integrationProviders)[number];

export const createIntegrationSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  provider: z.enum(integrationProviders),
  name: z.string().trim().min(1, "Informe o nome da integração.").max(120, "Nome muito longo."),
  description: z.string().trim().max(500, "Descrição muito longa.").optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

export const deactivateIntegrationSchema = z.object({
  integrationId: z.string().uuid("Integração inválida."),
  organizationId: z.string().uuid("Organização inválida."),
});
export type DeactivateIntegrationInput = z.infer<typeof deactivateIntegrationSchema>;

/**
 * Armazenamento (criação/rotação) de credencial de uma integração. `secret`
 * NUNCA é retornado de volta ao client depois de criptografado — a action
 * `storeCredential` só devolve `secretLastFour`.
 */
export const storeCredentialSchema = z.object({
  integrationId: z.string().uuid("Integração inválida."),
  organizationId: z.string().uuid("Organização inválida."),
  secret: z.string().trim().min(1, "Informe o segredo (token/API key)."),
});
export type StoreCredentialInput = z.infer<typeof storeCredentialSchema>;

"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, lastFourChars } from "@/lib/crypto/secret-encryption";
import {
  createIntegrationSchema,
  deactivateIntegrationSchema,
  storeCredentialSchema,
  type CreateIntegrationInput,
  type DeactivateIntegrationInput,
  type StoreCredentialInput,
} from "@/lib/validation/integrations";

export interface ActionResult {
  success: boolean;
  error?: string;
  integrationId?: string;
}

/**
 * Cria uma integração (CLAUDE.md §16). Autorização: admin/super_admin da
 * organização — reforçada aqui no servidor E pela policy
 * `integrations_insert` (RLS), nunca só no client (CLAUDE.md §13/§14).
 * `config` é a configuração NÃO-sensível (nunca segredos — ver
 * `storeCredential` para o segredo).
 */
export async function createIntegration(input: CreateIntegrationInput): Promise<ActionResult> {
  const parsed = createIntegrationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .insert({
      organization_id: parsed.data.organizationId,
      provider: parsed.data.provider,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: parsed.data.config,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar a integração." };
  }

  revalidatePath("/settings/integrations");
  return { success: true, integrationId: (data as { id: string }).id };
}

/** Desativa uma integração. Nunca é excluída via client (CLAUDE.md §22 — preserva histórico). */
export async function deactivateIntegration(input: DeactivateIntegrationInput): Promise<ActionResult> {
  const parsed = deactivateIntegrationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({ is_active: false })
    .eq("id", parsed.data.integrationId)
    .eq("organization_id", parsed.data.organizationId);

  if (error) {
    return { success: false, error: "Não foi possível desativar a integração." };
  }

  revalidatePath("/settings/integrations");
  return { success: true };
}

export interface StoreCredentialResult {
  success: boolean;
  error?: string;
  secretLastFour?: string | null;
}

/**
 * Cria/rotaciona o segredo (token/API key) de uma integração
 * (CLAUDE.md §3.10 / §16). Autorização verificada no servidor (mesma regra
 * de `createIntegration`) ANTES de qualquer escrita — `integration_credentials`
 * não tem policy de RLS alguma (ver migration), então a única barreira
 * contra um chamador não autorizado é esta checagem aqui.
 *
 * Usa o client ADMIN (service role) deliberadamente: é a única forma de
 * escrever em `integration_credentials` (RLS sem policies bloqueia até
 * admin via client comum). O segredo é criptografado (`encryptSecret`,
 * AES-256-GCM server-only) ANTES de qualquer chamada ao banco — o
 * plaintext nunca é persistido, nunca é logado, e NUNCA é retornado desta
 * função: só `secretLastFour` (cosmético) volta ao client.
 */
export async function storeCredential(input: StoreCredentialInput): Promise<StoreCredentialResult> {
  const parsed = storeCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  // Confirma que a integração pertence à organização informada (defesa em
  // profundidade — evita gravar credencial "cruzada" mesmo que o client
  // envie um integrationId de outra organização).
  const supabase = await createClient();
  const { data: integration } = await supabase
    .from("integrations")
    .select("id, organization_id")
    .eq("id", parsed.data.integrationId)
    .eq("organization_id", parsed.data.organizationId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (!integration) {
    return { success: false, error: "Integração não encontrada." };
  }

  let ciphertext: string;
  try {
    ciphertext = encryptSecret(parsed.data.secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao criptografar o segredo.";
    return { success: false, error: message };
  }
  const lastFour = lastFourChars(parsed.data.secret);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("integration_credentials")
    .select("id")
    .eq("integration_id", parsed.data.integrationId)
    .maybeSingle<{ id: string }>();

  const { error } = await admin.from("integration_credentials").upsert(
    {
      integration_id: parsed.data.integrationId,
      secret_ciphertext: ciphertext,
      secret_last_four: lastFour,
      created_by: user.id,
      rotated_at: existing ? new Date().toISOString() : null,
    },
    { onConflict: "integration_id" },
  );

  if (error) {
    return { success: false, error: "Não foi possível salvar a credencial." };
  }

  revalidatePath("/settings/integrations");
  return { success: true, secretLastFour: lastFour };
}

/**
 * Retorna somente `secret_last_four` para exibição cosmética na UI
 * ("****1234") — NUNCA o ciphertext nem o segredo em texto plano. Usa o
 * client admin porque `integration_credentials` não tem policy de SELECT
 * alguma (ver migration) — este é o único caminho server-side autorizado
 * de leitura, e mesmo assim nunca expõe `secret_ciphertext` na resposta.
 */
export async function getIntegrationCredentialLastFour(
  integrationId: string,
  organizationId: string,
): Promise<string | null> {
  await requireOrgRole(organizationId, ["super_admin", "admin"]);

  const supabase = await createClient();
  const { data: integration } = await supabase
    .from("integrations")
    .select("id")
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string }>();

  if (!integration) {
    return null;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_credentials")
    .select("secret_last_four")
    .eq("integration_id", integrationId)
    .maybeSingle<{ secret_last_four: string | null }>();

  return data?.secret_last_four ?? null;
}

export interface IntegrationSummary {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  isActive: boolean;
  hasCredential: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lista as integrações da organização, com `hasCredential` calculado via
 * client admin (a única forma de saber se existe credencial, já que a
 * tabela não é legível por ninguém além de service_role) — sem NUNCA
 * expor o ciphertext ou o segredo.
 */
export async function listIntegrations(organizationId: string): Promise<IntegrationSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("integrations")
    .select("id, organization_id, provider, name, description, config, is_active, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as {
    id: string;
    organization_id: string;
    provider: string;
    name: string;
    description: string | null;
    config: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }[];

  if (rows.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data: credentialRows } = await admin
    .from("integration_credentials")
    .select("integration_id")
    .in(
      "integration_id",
      rows.map((r) => r.id),
    );
  const idsWithCredential = new Set(((credentialRows ?? []) as { integration_id: string }[]).map((r) => r.integration_id));

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    name: row.name,
    description: row.description,
    config: row.config ?? {},
    isActive: row.is_active,
    hasCredential: idsWithCredential.has(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

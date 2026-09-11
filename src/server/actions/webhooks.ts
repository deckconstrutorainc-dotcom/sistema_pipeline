"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secret-encryption";
import {
  createWebhookSchema,
  toggleWebhookSchema,
  updateWebhookSchema,
  type CreateWebhookInput,
  type ToggleWebhookInput,
  type UpdateWebhookInput,
} from "@/lib/validation/webhooks";

export interface ActionResult {
  success: boolean;
  error?: string;
  webhookId?: string;
}

/**
 * Cria um webhook (CLAUDE.md §16, M7). Autorização: admin/super_admin da
 * organização — reforçada aqui E pela policy `webhooks_insert` (RLS).
 * `secret` (se informado) é criptografado (`encryptSecret`, AES-256-GCM
 * server-only — mesma função usada por `storeCredential`) ANTES de
 * qualquer escrita; usa o client ADMIN só para ESTA coluna sensível
 * porque `secret_ciphertext` não é gravável nem legível via RLS/GRANT de
 * coluna para o role `authenticated` (ver
 * `20260818094700_ecosystem_rls_policies.sql`) — o restante da linha é
 * gravado normalmente via client do usuário (RLS).
 */
export async function createWebhook(input: CreateWebhookInput): Promise<ActionResult> {
  const parsed = createWebhookSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();
  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  if (parsed.data.pipeId) {
    const supabase = await createClient();
    const { data: pipe } = await supabase
      .from("pipes")
      .select("organization_id")
      .eq("id", parsed.data.pipeId)
      .maybeSingle<{ organization_id: string }>();
    if (!pipe || pipe.organization_id !== parsed.data.organizationId) {
      return { success: false, error: "Pipe não encontrado nesta organização." };
    }
  }

  let secretCiphertext: string | null = null;
  if (parsed.data.secret) {
    try {
      secretCiphertext = encryptSecret(parsed.data.secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criptografar o segredo.";
      return { success: false, error: message };
    }
  }

  // secret_ciphertext não é gravável via client comum (coluna sem GRANT de
  // escrita para authenticated seria o ideal simétrico ao SELECT, mas
  // manter a escrita completa via admin evita qualquer ambiguidade de
  // policy — a linha inteira é criada de uma vez pelo service role,
  // idêntica ao que seria criado via client, exceto pelo segredo).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webhooks")
    .insert({
      organization_id: parsed.data.organizationId,
      pipe_id: parsed.data.pipeId ?? null,
      direction: parsed.data.direction,
      url: parsed.data.url ?? null,
      event_types: parsed.data.eventTypes,
      secret_ciphertext: secretCiphertext,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o webhook." };
  }

  revalidatePath("/settings/webhooks");
  return { success: true, webhookId: (data as { id: string }).id };
}

/**
 * Atualiza URL/eventos/segredo de um webhook. Mesma justificativa de uso
 * do client admin de `createWebhook` (coluna de segredo).
 */
export async function updateWebhook(input: UpdateWebhookInput): Promise<ActionResult> {
  const parsed = updateWebhookSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const update: Record<string, unknown> = {};
  if (parsed.data.url !== undefined) update.url = parsed.data.url;
  if (parsed.data.eventTypes !== undefined) update.event_types = parsed.data.eventTypes;
  if (parsed.data.secret !== undefined) {
    try {
      update.secret_ciphertext = encryptSecret(parsed.data.secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criptografar o segredo.";
      return { success: false, error: message };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("webhooks")
    .update(update)
    .eq("id", parsed.data.webhookId)
    .eq("organization_id", parsed.data.organizationId);

  if (error) {
    return { success: false, error: "Não foi possível atualizar o webhook." };
  }

  revalidatePath("/settings/webhooks");
  return { success: true };
}

/** Ativa/desativa um webhook. Nunca excluído via client (CLAUDE.md §22). */
export async function toggleWebhook(input: ToggleWebhookInput): Promise<ActionResult> {
  const parsed = toggleWebhookSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("webhooks")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.webhookId)
    .eq("organization_id", parsed.data.organizationId);

  if (error) {
    return { success: false, error: "Não foi possível alterar o status do webhook." };
  }

  revalidatePath("/settings/webhooks");
  return { success: true };
}

export interface WebhookSummary {
  id: string;
  organizationId: string;
  pipeId: string | null;
  direction: string;
  url: string | null;
  eventTypes: string[];
  hasSecret: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lista os webhooks da organização. O SELECT via client comum já não
 * retorna `secret_ciphertext` (GRANT de coluna bloqueia a coluna inteira
 * para `authenticated` — ver migration de RLS) — `hasSecret` é calculado
 * separadamente via client admin, sem nunca expor o valor.
 */
export async function listWebhooks(organizationId: string): Promise<WebhookSummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("webhooks")
    .select("id, organization_id, pipe_id, direction, url, event_types, is_active, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as {
    id: string;
    organization_id: string;
    pipe_id: string | null;
    direction: string;
    url: string | null;
    event_types: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }[];

  if (rows.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data: secretRows } = await admin
    .from("webhooks")
    .select("id, secret_ciphertext")
    .in(
      "id",
      rows.map((r) => r.id),
    );
  const idsWithSecret = new Set(
    ((secretRows ?? []) as { id: string; secret_ciphertext: string | null }[])
      .filter((r) => r.secret_ciphertext)
      .map((r) => r.id),
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    pipeId: row.pipe_id,
    direction: row.direction,
    url: row.url,
    eventTypes: row.event_types ?? [],
    hasSecret: idsWithSecret.has(row.id),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export interface WebhookDeliverySummary {
  id: string;
  direction: string;
  status: string;
  httpStatus: number | null;
  attempt: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

/**
 * Histórico de entregas/recebimentos de um webhook (CLAUDE.md §11 "logs de
 * execução" / §18 auditoria). A policy `webhook_deliveries_select` (RLS)
 * já restringe a leitura a admin/super_admin da organização dona do
 * webhook.
 */
export async function listWebhookDeliveries(webhookId: string): Promise<WebhookDeliverySummary[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("id, direction, status, http_status, attempt, max_attempts, error_message, created_at, delivered_at")
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (
    data as unknown as {
      id: string;
      direction: string;
      status: string;
      http_status: number | null;
      attempt: number;
      max_attempts: number;
      error_message: string | null;
      created_at: string;
      delivered_at: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    direction: row.direction,
    status: row.status,
    httpStatus: row.http_status,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  }));
}

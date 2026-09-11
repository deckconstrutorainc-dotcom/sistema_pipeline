"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, requireOrgRole } from "@/lib/auth/session";
import { getEmailProvider } from "@/lib/email/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createEmailTemplateSchema,
  logOutboundEmailSchema,
  type CreateEmailTemplateInput,
  type LogOutboundEmailInput,
} from "@/lib/validation/email";

export interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export async function createEmailTemplate(input: CreateEmailTemplateInput): Promise<ActionResult> {
  const parsed = createEmailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireOrgRole(parsed.data.organizationId, ["super_admin", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      organization_id: parsed.data.organizationId,
      pipe_id: parsed.data.pipeId ?? null,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "Não foi possível criar o template de e-mail." };
  }

  revalidatePath("/pipes");
  return { success: true, id: (data as { id: string }).id };
}

/**
 * Registra (e tenta enviar via `EmailProvider`, CLAUDE.md §16) uma mensagem
 * de e-mail outbound vinculada a um card.
 *
 * Usa `createAdminClient()` (service role) DELIBERADAMENTE: `email_threads`/
 * `email_messages` não têm policy de INSERT para `authenticated` (ver
 * `20260818093600_collaboration_rls_policies.sql`) — a única forma de
 * escrever é a partir do server, depois de o próprio server já ter validado
 * autorização via `requireAuth()` + checagem de acesso ao card abaixo. Isto
 * roda inteiramente no servidor ("use server"); a service role nunca chega
 * ao navegador (CLAUDE.md §2/§10).
 */
export async function logOutboundEmail(input: LogOutboundEmailInput): Promise<ActionResult> {
  const parsed = logOutboundEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireAuth();

  // Confirma que o usuário autenticado tem acesso ao card (via RLS do
  // client normal, não do admin) antes de usar o client administrativo
  // para a escrita — nunca confiamos apenas em "está autenticado".
  const userClient = await createClient();
  const { data: card, error: cardError } = await userClient
    .from("cards")
    .select("id, pipe_id")
    .eq("id", parsed.data.cardId)
    .maybeSingle<{ id: string; pipe_id: string }>();

  if (cardError || !card) {
    return { success: false, error: "Card não encontrado ou sem permissão de acesso." };
  }

  const admin = createAdminClient();

  let threadId = parsed.data.threadId;
  if (!threadId) {
    const { data: thread, error: threadError } = await admin
      .from("email_threads")
      .insert({ card_id: parsed.data.cardId, subject: parsed.data.subject })
      .select("id")
      .single();
    if (threadError || !thread) {
      return { success: false, error: "Não foi possível criar a conversa de e-mail." };
    }
    threadId = (thread as { id: string }).id;
  }

  const provider = getEmailProvider();
  const sendResult = await provider.send({
    fromAddress: parsed.data.fromAddress,
    toAddresses: parsed.data.toAddresses,
    subject: parsed.data.subject,
    body: parsed.data.body,
  });

  const { data: message, error: messageError } = await admin
    .from("email_messages")
    .insert({
      thread_id: threadId,
      direction: "outbound",
      from_address: parsed.data.fromAddress,
      to_addresses: parsed.data.toAddresses,
      body: parsed.data.body,
      status: sendResult.success ? "sent" : "failed",
      sent_at: sendResult.success ? new Date().toISOString() : null,
      provider_message_id: sendResult.providerMessageId ?? null,
    })
    .select("id")
    .single();

  if (messageError || !message) {
    return { success: false, error: "E-mail processado, mas houve erro ao registrar a mensagem." };
  }

  // Insere diretamente via client administrativo (não por log_card_activity):
  // essa RPC exige auth.uid() não nulo, mas a conexão do client
  // administrativo (service role) não carrega um JWT de usuário — por isso
  // gravamos actor_id explicitamente a partir do usuário já autenticado e
  // verificado acima via userClient.
  await admin.from("card_activities").insert({
    card_id: parsed.data.cardId,
    actor_id: user.id,
    type: "email_sent",
    payload: { thread_id: threadId },
  });

  revalidatePath(`/pipes/${card.pipe_id}/cards/${card.id}`);
  return { success: true, id: (message as { id: string }).id };
}

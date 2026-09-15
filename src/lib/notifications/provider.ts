import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Adapter de notificação (CLAUDE.md §16: "Integrações devem usar
 * adapters" / "Não espalhar lógica específica de provider pelo domínio").
 *
 * Usado pela ação `send_notification` das automações. A implementação
 * padrão grava notificações in-app na tabela `notifications`, via as
 * funções security definer da migration 20260915090000 — o worker roda
 * com service role, que é quem tem permissão de chamá-las.
 *
 * Trocar ou somar um canal (e-mail, push) é implementar esta interface e
 * compor os providers em `getNotificationProvider()`; o processador de
 * automações não muda.
 */
export interface NotificationInput {
  cardId: string;
  message: string;
  /** Destinatários explícitos. Sem eles, notifica os participantes do card. */
  userIds?: string[];
}

export interface NotificationProvider {
  send(input: NotificationInput): Promise<void>;
}

export class DatabaseNotificationProvider implements NotificationProvider {
  async send(input: NotificationInput): Promise<void> {
    const admin = createAdminClient();
    const title = "Aviso de automação";

    const { error } =
      input.userIds && input.userIds.length > 0
        ? await admin.rpc("notify_users", {
            p_card_id: input.cardId,
            p_user_ids: input.userIds,
            p_type: "automation",
            p_actor_id: null,
            p_title: title,
            p_body: input.message,
          })
        : await admin.rpc("notify_card_participants", {
            p_card_id: input.cardId,
            p_type: "automation",
            p_actor_id: null,
            p_title: title,
            p_body: input.message,
          });

    // Erro sobe para o processador, que marca a ação como falha no
    // automation_run — nunca some em silêncio (CLAUDE.md §24).
    if (error) {
      throw new Error(`Falha ao criar notificação: ${error.message}`);
    }
  }
}

export function getNotificationProvider(): NotificationProvider {
  return new DatabaseNotificationProvider();
}

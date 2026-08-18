/**
 * Adapter de notificação (CLAUDE.md §16: "Integrações devem usar
 * adapters" / "Não espalhar lógica específica de provider pelo domínio").
 *
 * A ação `send_notification` de uma automação (M3) depende de um provider
 * real de e-mail/push, que é infraestrutura de um milestone futuro (M5
 * Colaboração externa / M7 Ecosystem) — fora do escopo deste milestone.
 * `ConsoleNotificationProvider` é a implementação padrão atual: não envia
 * nada de fato, apenas registra a intenção (console + o chamador também
 * grava em `card_activities`, que é o registro de auditoria real). Trocar
 * por um provider real (e-mail, push, Slack...) no futuro significa apenas
 * implementar esta interface e trocar a instância usada em
 * `automation-processor.ts` — nenhuma lógica de domínio muda.
 */
export interface NotificationInput {
  cardId: string;
  message: string;
  userIds?: string[];
}

export interface NotificationProvider {
  send(input: NotificationInput): Promise<void>;
}

export class ConsoleNotificationProvider implements NotificationProvider {
  async send(input: NotificationInput): Promise<void> {
    // eslint-disable-next-line no-console -- provider "no-op" documentado: sem infra de envio real neste milestone.
    console.info("[notifications] send_notification (sem provider real configurado):", input);
  }
}

export function getNotificationProvider(): NotificationProvider {
  return new ConsoleNotificationProvider();
}

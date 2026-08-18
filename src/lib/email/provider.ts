/**
 * Adapter de provedor de e-mail (CLAUDE.md §16: integrações usam adapters,
 * nunca lógica específica de provider espalhada pelo domínio).
 *
 * M5 modela e-mail vinculado a card (templates, threads, mensagens) mas NÃO
 * implementa envio real — só o registro das mensagens (ver
 * `src/server/actions/email.ts`). `NullEmailProvider` é a implementação de
 * desenvolvimento/teste: não envia nada de verdade, só loga.
 *
 * PENDÊNCIA REAL (documentada, não implementada): produção precisa de uma
 * implementação real (`ResendEmailProvider`, `SesEmailProvider`, etc.) e de
 * um webhook de entrada para transformar e-mails recebidos em
 * `email_messages` com `direction = 'inbound'`. Nenhum dos dois está no
 * escopo deste milestone.
 */
export interface EmailMessageInput {
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  body: string;
}

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(message: EmailMessageInput): Promise<EmailSendResult>;
}

/**
 * Implementação nula para desenvolvimento/teste: não envia e-mail real,
 * apenas registra no console do servidor. Nunca deve ser usada como
 * implementação "final" em produção (CLAUDE.md §15: mock não é
 * implementação definitiva) — é um placeholder explícito até um provider
 * real (ex.: Resend) ser configurado.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessageInput): Promise<EmailSendResult> {
    // eslint-disable-next-line no-console
    console.info("[ConsoleEmailProvider] e-mail não enviado de verdade (dev/stub):", {
      from: message.fromAddress,
      to: message.toAddresses,
      subject: message.subject,
    });
    return { success: true, providerMessageId: `console-${Date.now()}` };
  }
}

let cachedProvider: EmailProvider | null = null;

/**
 * Resolve o provider ativo. Hoje sempre retorna `ConsoleEmailProvider`
 * (nenhuma variável de ambiente de provider real configurada) — trocar por
 * um provider real é uma questão de implementar `EmailProvider` e resolver
 * aqui a partir de uma env var (ex.: `EMAIL_PROVIDER=resend`), sem tocar em
 * nenhum outro ponto do domínio.
 */
export function getEmailProvider(): EmailProvider {
  if (!cachedProvider) {
    cachedProvider = new ConsoleEmailProvider();
  }
  return cachedProvider;
}

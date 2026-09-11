/**
 * Interfaces de adapter para integrações externas (CLAUDE.md §16 —
 * "Integrações devem usar adapters" / "Não espalhar lógica específica de
 * provider pelo domínio"). Cada provider concreto implementa a interface
 * relevante; o domínio (server actions, dispatcher) só conhece estas
 * interfaces, nunca detalhes de um provider específico.
 *
 * Segue o mesmo padrão já usado por `EmailProvider` (M5,
 * `src/lib/email/provider.ts`) e `NotificationProvider` (M3,
 * `src/lib/notifications/provider.ts`).
 */

/** Resultado padrão de uma chamada de integração — sucesso/erro uniforme. */
export interface IntegrationCallResult {
  success: boolean;
  providerReferenceId?: string;
  error?: string;
}

/**
 * Interface genérica que todo adapter de integração implementa. Cada
 * provider concreto tem métodos adicionais próprios do seu domínio (ex.:
 * `SignatureProvider.createEnvelope`) além destes — `execute` é o único
 * método verdadeiramente genérico, usado pelo webhook HTTP simples que não
 * tem uma operação de negócio mais específica que "enviar dados".
 */
export interface IntegrationProvider {
  readonly providerKey: "http_webhook" | "email" | "google" | "microsoft" | "e_signature";
  execute(input: Record<string, unknown>): Promise<IntegrationCallResult>;
}

/**
 * Adapter de provedor de assinatura eletrônica (exemplo literal do
 * CLAUDE.md §16). `createEnvelope` inicia um "envelope" de assinatura
 * (documento + signatários); o restante do ciclo de vida (webhooks de
 * status do provider, download do documento assinado) fica fora do
 * escopo deste stub — ver `e-signature-provider.ts`.
 */
export interface SignatureEnvelopeInput {
  documentName: string;
  documentUrl: string;
  signers: { name: string; email: string }[];
}

export interface SignatureEnvelopeResult {
  envelopeId: string;
  status: "created" | "sent" | "completed" | "voided";
}

export interface SignatureProvider {
  createEnvelope(input: SignatureEnvelopeInput): Promise<SignatureEnvelopeResult>;
}

/**
 * Erro explícito para stubs de adapter que ainda não têm implementação
 * real (dependem de credenciais/app OAuth externos indisponíveis neste
 * ambiente — ver `google-provider.ts`/`microsoft-provider.ts`/
 * `e-signature-provider.ts`). Nunca deve ser confundido com um erro de
 * runtime de um provider real configurado.
 */
export class NotImplementedError extends Error {
  constructor(providerName: string, method: string) {
    super(
      `${providerName}.${method}() não está implementado nesta fase (M7). ` +
        "Requer registro de aplicativo OAuth real com o provedor externo " +
        "(credenciais que não existem neste ambiente de desenvolvimento) " +
        "— ver comentário no topo do arquivo do adapter para o que falta em produção.",
    );
    this.name = "NotImplementedError";
  }
}

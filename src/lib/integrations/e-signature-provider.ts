/**
 * Stub de adapter para provedor de assinatura eletrônica (ex.: DocuSign,
 * Clicksign, Autentique, Adobe Sign — nenhum específico escolhido; a
 * interface `SignatureProvider` é o exemplo literal citado em
 * CLAUDE.md §16).
 *
 * PENDÊNCIA REAL (documentada, não implementada nesta fase): produção
 * precisa de:
 *   1. Conta/app registrado no provedor de assinatura escolhido (API
 *      key ou client_id/client_secret OAuth, dependendo do provedor);
 *   2. Upload do documento para o provedor (ou URL assinada acessível por
 *      ele) e definição de signatários/ordem de assinatura;
 *   3. Webhook do provedor (inbound — reaproveitaria
 *      `src/app/api/webhooks/inbound/[webhookId]/route.ts` deste mesmo
 *      milestone) para receber atualizações de status do envelope
 *      (assinado, recusado, expirado) e refletir em `documents`/
 *      `card_activities` (M6/M2) — não implementado aqui, apenas o ponto
 *      de entrada genérico de webhook inbound já existe.
 *
 * Nenhuma credencial externa de um provedor real está disponível neste
 * ambiente — não é possível implementar de verdade sem ela. Este arquivo
 * documenta a interface completa (`SignatureProvider`, CLAUDE.md §16) e
 * lança `NotImplementedError` claro em vez de simular sucesso.
 */
import { NotImplementedError } from "@/lib/integrations/types";
import type { SignatureEnvelopeInput, SignatureEnvelopeResult, SignatureProvider } from "@/lib/integrations/types";

const PROVIDER_NAME = "ESignatureProvider";

export class ESignatureProvider implements SignatureProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura documental da interface (CLAUDE.md §16); sempre lança, nunca lê o parâmetro.
  async createEnvelope(input: SignatureEnvelopeInput): Promise<SignatureEnvelopeResult> {
    throw new NotImplementedError(PROVIDER_NAME, "createEnvelope");
  }
}

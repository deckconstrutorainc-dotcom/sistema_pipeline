/**
 * Stub de adapter para integração Google (Workspace/Calendar/Gmail/etc).
 *
 * PENDÊNCIA REAL (documentada, não implementada nesta fase): produção
 * precisa de:
 *   1. Um app OAuth 2.0 registrado no Google Cloud Console (client_id/
 *      client_secret), com os escopos corretos aprovados (potencialmente
 *      sujeitos a revisão de verificação do Google para escopos
 *      sensíveis);
 *   2. Fluxo de autorização (redirect + callback) para o usuário consentir
 *      e gerar um refresh_token, que seria então armazenado (criptografado,
 *      via `integration_credentials`/`storeCredential`) por integração;
 *   3. Renovação de access_token via refresh_token antes de cada chamada
 *      à API do Google.
 *
 * Nenhuma dessas credenciais externas existe neste ambiente de
 * desenvolvimento — não é possível implementar OAuth de verdade sem elas.
 * Este arquivo documenta a INTERFACE completa esperada (para que a
 * implementação real, quando houver credenciais, seja só preencher os
 * métodos) e lança `NotImplementedError` claro em vez de simular sucesso
 * (CLAUDE.md §15/§16: nunca fingir uma integração funcional com mock).
 */
import { NotImplementedError } from "@/lib/integrations/types";
import type { IntegrationCallResult, IntegrationProvider } from "@/lib/integrations/types";

const PROVIDER_NAME = "GoogleProvider";

export class GoogleProvider implements IntegrationProvider {
  readonly providerKey = "google" as const;

  /** Trocaria um `authorization_code` por tokens de acesso/refresh. Requer app OAuth registrado — ver comentário no topo do arquivo. */
  async exchangeAuthorizationCode(): Promise<never> {
    throw new NotImplementedError(PROVIDER_NAME, "exchangeAuthorizationCode");
  }

  /** Renovaria um access_token expirado a partir do refresh_token armazenado. */
  async refreshAccessToken(): Promise<never> {
    throw new NotImplementedError(PROVIDER_NAME, "refreshAccessToken");
  }

  async execute(): Promise<IntegrationCallResult> {
    throw new NotImplementedError(PROVIDER_NAME, "execute");
  }
}

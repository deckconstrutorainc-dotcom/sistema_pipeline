/**
 * Stub de adapter para integração Microsoft (Azure AD / Microsoft 365 /
 * Outlook/Teams via Microsoft Graph).
 *
 * PENDÊNCIA REAL (documentada, não implementada nesta fase): produção
 * precisa de:
 *   1. Um app registrado no Azure AD / Microsoft Entra ID (application
 *      (client) ID + client secret ou certificado), com os escopos do
 *      Microsoft Graph corretos consentidos pelo tenant;
 *   2. Fluxo de autorização OAuth 2.0 (authorization code + PKCE
 *      recomendado) para gerar um refresh_token por integração,
 *      armazenado criptografado via `integration_credentials`;
 *   3. Renovação de access_token via refresh_token antes de cada chamada
 *      ao Microsoft Graph.
 *
 * Nenhuma dessas credenciais externas existe neste ambiente de
 * desenvolvimento — não é possível implementar OAuth de verdade sem elas.
 * Este arquivo documenta a INTERFACE completa esperada e lança
 * `NotImplementedError` claro em vez de simular sucesso (CLAUDE.md
 * §15/§16).
 */
import { NotImplementedError } from "@/lib/integrations/types";
import type { IntegrationCallResult, IntegrationProvider } from "@/lib/integrations/types";

const PROVIDER_NAME = "MicrosoftProvider";

export class MicrosoftProvider implements IntegrationProvider {
  readonly providerKey = "microsoft" as const;

  /** Trocaria um `authorization_code` por tokens de acesso/refresh via Azure AD. Requer app registrado — ver comentário no topo do arquivo. */
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

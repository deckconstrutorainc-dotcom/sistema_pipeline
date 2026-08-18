import { describe, expect, it } from "vitest";

import {
  createIntegrationSchema,
  deactivateIntegrationSchema,
  storeCredentialSchema,
} from "@/lib/validation/integrations";

const organizationId = "11111111-1111-1111-1111-111111111111";
const integrationId = "22222222-2222-2222-2222-222222222222";

describe("createIntegrationSchema", () => {
  it("aceita uma integração http_webhook simples", () => {
    const result = createIntegrationSchema.safeParse({
      organizationId,
      provider: "http_webhook",
      name: "Notificações ERP",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toEqual({});
    }
  });

  it("aceita todos os providers suportados", () => {
    for (const provider of ["http_webhook", "email", "google", "microsoft", "e_signature"]) {
      const result = createIntegrationSchema.safeParse({ organizationId, provider, name: "Integração" });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita provider desconhecido", () => {
    const result = createIntegrationSchema.safeParse({
      organizationId,
      provider: "slack",
      name: "Integração",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    const result = createIntegrationSchema.safeParse({ organizationId, provider: "http_webhook", name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejeita organizationId que não é uuid", () => {
    const result = createIntegrationSchema.safeParse({
      organizationId: "not-a-uuid",
      provider: "http_webhook",
      name: "Integração",
    });
    expect(result.success).toBe(false);
  });

  it("aceita config jsonb arbitrária", () => {
    const result = createIntegrationSchema.safeParse({
      organizationId,
      provider: "http_webhook",
      name: "Integração",
      config: { defaultUrl: "https://exemplo.com", scopes: ["read", "write"] },
    });
    expect(result.success).toBe(true);
  });
});

describe("deactivateIntegrationSchema", () => {
  it("aceita ids válidos", () => {
    const result = deactivateIntegrationSchema.safeParse({ integrationId, organizationId });
    expect(result.success).toBe(true);
  });

  it("rejeita integrationId inválido", () => {
    const result = deactivateIntegrationSchema.safeParse({ integrationId: "abc", organizationId });
    expect(result.success).toBe(false);
  });
});

describe("storeCredentialSchema", () => {
  it("aceita um segredo não vazio", () => {
    const result = storeCredentialSchema.safeParse({ integrationId, organizationId, secret: "token-secreto-123" });
    expect(result.success).toBe(true);
  });

  it("rejeita segredo vazio", () => {
    const result = storeCredentialSchema.safeParse({ integrationId, organizationId, secret: "  " });
    expect(result.success).toBe(false);
  });

  it("rejeita ausência de secret", () => {
    const result = storeCredentialSchema.safeParse({ integrationId, organizationId });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { signWebhookPayload, verifyWebhookSignature, WEBHOOK_SIGNATURE_HEADER } from "@/lib/integrations/webhook-signature";

describe("signWebhookPayload", () => {
  it("gera uma assinatura determinística (mesmo segredo/payload => mesma assinatura)", () => {
    const a = signWebhookPayload("segredo-123", '{"a":1}');
    const b = signWebhookPayload("segredo-123", '{"a":1}');
    expect(a).toBe(b);
  });

  it("prefixa a assinatura com sha256=", () => {
    const sig = signWebhookPayload("segredo-123", "payload");
    expect(sig.startsWith("sha256=")).toBe(true);
  });

  it("gera assinaturas diferentes para segredos diferentes", () => {
    const a = signWebhookPayload("segredo-A", "payload");
    const b = signWebhookPayload("segredo-B", "payload");
    expect(a).not.toBe(b);
  });

  it("gera assinaturas diferentes para payloads diferentes", () => {
    const a = signWebhookPayload("segredo", "payload-1");
    const b = signWebhookPayload("segredo", "payload-2");
    expect(a).not.toBe(b);
  });
});

describe("verifyWebhookSignature", () => {
  it("aceita uma assinatura válida", () => {
    const secret = "meu-segredo";
    const payload = JSON.stringify({ event_type: "card.created", entity_id: "abc" });
    const signature = signWebhookPayload(secret, payload);
    expect(verifyWebhookSignature(secret, payload, signature)).toBe(true);
  });

  it("rejeita uma assinatura de segredo diferente", () => {
    const payload = "{}";
    const signature = signWebhookPayload("segredo-correto", payload);
    expect(verifyWebhookSignature("segredo-errado", payload, signature)).toBe(false);
  });

  it("rejeita quando o payload foi alterado depois de assinado", () => {
    const secret = "segredo";
    const signature = signWebhookPayload(secret, "payload-original");
    expect(verifyWebhookSignature(secret, "payload-adulterado", signature)).toBe(false);
  });

  it("rejeita assinatura ausente (null)", () => {
    expect(verifyWebhookSignature("segredo", "payload", null)).toBe(false);
  });

  it("rejeita assinatura malformada (tamanho diferente do esperado)", () => {
    expect(verifyWebhookSignature("segredo", "payload", "sha256=abc")).toBe(false);
  });

  it("o nome do header exportado é o esperado (x-bts-signature)", () => {
    expect(WEBHOOK_SIGNATURE_HEADER).toBe("x-bts-signature");
  });
});

import { describe, expect, it } from "vitest";

import {
  createWebhookSchema,
  listWebhookDeliveriesSchema,
  toggleWebhookSchema,
  updateWebhookSchema,
} from "@/lib/validation/webhooks";

const organizationId = "11111111-1111-1111-1111-111111111111";
const webhookId = "22222222-2222-2222-2222-222222222222";
const pipeId = "33333333-3333-3333-3333-333333333333";

describe("createWebhookSchema", () => {
  it("aceita um webhook outbound com URL e eventos", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "outbound",
      url: "https://exemplo.com/webhook",
      eventTypes: ["card.created"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita webhook outbound sem URL", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "outbound",
      eventTypes: ["card.created"],
    });
    expect(result.success).toBe(false);
  });

  it("aceita webhook inbound sem URL", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "inbound",
      eventTypes: ["card.moved"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita quando nenhum evento é selecionado", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "outbound",
      url: "https://exemplo.com",
      eventTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita evento desconhecido", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "outbound",
      url: "https://exemplo.com",
      eventTypes: ["card.deleted"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita URL inválida", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "outbound",
      url: "não é uma url",
      eventTypes: ["card.created"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita segredo curto demais (< 8 caracteres)", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      direction: "outbound",
      url: "https://exemplo.com",
      eventTypes: ["card.created"],
      secret: "curto",
    });
    expect(result.success).toBe(false);
  });

  it("aceita pipeId opcional", () => {
    const result = createWebhookSchema.safeParse({
      organizationId,
      pipeId,
      direction: "outbound",
      url: "https://exemplo.com",
      eventTypes: ["card.created"],
    });
    expect(result.success).toBe(true);
  });
});

describe("updateWebhookSchema", () => {
  it("aceita atualização parcial (só URL)", () => {
    const result = updateWebhookSchema.safeParse({ webhookId, organizationId, url: "https://novo.exemplo.com" });
    expect(result.success).toBe(true);
  });

  it("rejeita webhookId inválido", () => {
    const result = updateWebhookSchema.safeParse({ webhookId: "abc", organizationId });
    expect(result.success).toBe(false);
  });
});

describe("toggleWebhookSchema", () => {
  it("aceita isActive boolean", () => {
    const result = toggleWebhookSchema.safeParse({ webhookId, organizationId, isActive: false });
    expect(result.success).toBe(true);
  });

  it("rejeita isActive não booleano", () => {
    const result = toggleWebhookSchema.safeParse({ webhookId, organizationId, isActive: "sim" });
    expect(result.success).toBe(false);
  });
});

describe("listWebhookDeliveriesSchema", () => {
  it("aceita webhookId válido", () => {
    expect(listWebhookDeliveriesSchema.safeParse({ webhookId }).success).toBe(true);
  });
});

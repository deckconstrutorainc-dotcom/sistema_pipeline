import { describe, expect, it } from "vitest";

import { renderDocumentTemplate, type RenderCardData } from "@/server/services/documents";

const card: RenderCardData = {
  title: "Contrato 123",
  number: 42,
  dueDate: "2026-03-01T00:00:00.000Z",
  createdAt: "2026-01-10T00:00:00.000Z",
};

describe("renderDocumentTemplate", () => {
  it("resolve placeholders {{card.*}}", () => {
    const result = renderDocumentTemplate({
      body: "<p>{{card.title}} (#{{card.number}})</p>",
      card,
      fieldValuesByKey: {},
    });
    expect(result).toBe("<p>Contrato 123 (#42)</p>");
  });

  it("resolve placeholders {{field.<key>}} a partir de fieldValuesByKey", () => {
    const result = renderDocumentTemplate({
      body: "<p>Fornecedor: {{field.razao_social}}</p>",
      card,
      fieldValuesByKey: { razao_social: "Acme LTDA" },
    });
    expect(result).toBe("<p>Fornecedor: Acme LTDA</p>");
  });

  it("substitui placeholder ausente por string vazia, sem lançar exceção", () => {
    const result = renderDocumentTemplate({
      body: "<p>{{field.inexistente}} - {{card.title}}</p>",
      card,
      fieldValuesByKey: {},
    });
    expect(result).toBe("<p> - Contrato 123</p>");
  });

  it("ignora namespace desconhecido, substituindo por string vazia", () => {
    const result = renderDocumentTemplate({
      body: "{{unknown.namespace}}",
      card,
      fieldValuesByKey: {},
    });
    expect(result).toBe("");
  });

  it("faz escaping básico de HTML em valores de campo (evita injeção via valor do usuário)", () => {
    const result = renderDocumentTemplate({
      body: "{{field.nome}}",
      card,
      fieldValuesByKey: { nome: '<script>alert("x")</script>' },
    });
    expect(result).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("formata booleanos como Sim/Não e arrays como lista separada por vírgula", () => {
    const result = renderDocumentTemplate({
      body: "{{field.ativo}} | {{field.tags}}",
      card,
      fieldValuesByKey: { ativo: true, tags: ["a", "b"] },
    });
    expect(result).toBe("Sim | a, b");
  });

  it("formata card.dueDate e card.createdAt como data (pt-BR)", () => {
    const result = renderDocumentTemplate({
      body: "{{card.dueDate}} / {{card.createdAt}}",
      card,
      fieldValuesByKey: {},
    });
    expect(result).toContain("2026");
  });

  it("trata null/undefined em valor de campo como string vazia", () => {
    const result = renderDocumentTemplate({
      body: "[{{field.vazio}}]",
      card,
      fieldValuesByKey: { vazio: null },
    });
    expect(result).toBe("[]");
  });
});

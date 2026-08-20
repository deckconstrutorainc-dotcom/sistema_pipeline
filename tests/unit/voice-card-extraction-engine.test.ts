/**
 * Testes da lógica PURA da feature "Voz -> Card" (M8): parsing/validação do
 * JSON do Gemini, casamento de responsável, normalização de data e
 * validação de campos customizados. Mesmo padrão de
 * `tests/unit/ai-run-processor.test.ts` (que testa `ai-run-engine.ts`, a
 * parte pura, e deixa o orquestrador I/O sem teste unitário) — o
 * orquestrador `voice-card-extraction.ts` chama o `GeminiProvider` real e o
 * Supabase, e por isso não é coberto aqui; foi verificado com uma chamada
 * real ao Gemini via script (ver relatório da tarefa).
 */
import { describe, expect, it } from "vitest";

import type { OrganizationMemberOption } from "@/server/queries/organizations";
import {
  buildExtractionPrompt,
  buildValidatedFieldValues,
  matchAssigneeId,
  normalizeDueDate,
  parseExtractionJson,
  type VoiceCardFieldSpec,
} from "@/server/services/voice-card-extraction-engine";

describe("parseExtractionJson", () => {
  it("faz o parse de um JSON válido", () => {
    const result = parseExtractionJson(
      '{"title": "Reforma de telhado", "dueDate": "2026-09-01", "assigneeName": "Pedro", "fields": {"valor": 15000}}',
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Reforma de telhado");
      expect(result.data.fields).toEqual({ valor: 15000 });
    }
  });

  it("remove cercas de bloco de código markdown antes do parse", () => {
    const result = parseExtractionJson('```json\n{"title": "Card X", "dueDate": null, "assigneeName": null}\n```');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Card X");
    }
  });

  it("falha de forma explícita para um JSON malformado (nunca tenta adivinhar)", () => {
    const result = parseExtractionJson("isso não é json");
    expect(result.success).toBe(false);
  });

  it("falha de forma explícita para um JSON válido mas fora do schema esperado", () => {
    const result = parseExtractionJson('{"title": 123}');
    expect(result.success).toBe(false);
  });

  it("aceita todos os campos como null/ausentes (nenhum dado extraído)", () => {
    const result = parseExtractionJson("{}");
    expect(result.success).toBe(true);
  });
});

describe("normalizeDueDate", () => {
  it("converte uma data YYYY-MM-DD para ISO", () => {
    const iso = normalizeDueDate("2026-09-01");
    expect(iso).not.toBeNull();
    expect(iso).toContain("2026-09-01");
  });

  it("retorna null para valor ausente", () => {
    expect(normalizeDueDate(null)).toBeNull();
    expect(normalizeDueDate(undefined)).toBeNull();
    expect(normalizeDueDate("")).toBeNull();
  });

  it("retorna null para uma data inválida (nunca lança)", () => {
    expect(normalizeDueDate("não é uma data")).toBeNull();
  });
});

describe("matchAssigneeId", () => {
  const members: OrganizationMemberOption[] = [
    { id: "user-1", fullName: "Pedro Souza" },
    { id: "user-2", fullName: "Maria Oliveira" },
    { id: "user-3", fullName: null },
  ];

  it("casa por nome exato (case-insensitive)", () => {
    expect(matchAssigneeId("pedro souza", members)).toBe("user-1");
  });

  it("casa por substring (nome falado é parte do nome completo)", () => {
    expect(matchAssigneeId("Pedro", members)).toBe("user-1");
  });

  it("casa por substring no sentido inverso (nome completo é parte do falado)", () => {
    expect(matchAssigneeId("o Pedro Souza da equipe", members)).toBe("user-1");
  });

  it("retorna null quando nenhum membro corresponde (nunca chuta um responsável)", () => {
    expect(matchAssigneeId("Fulano de Tal", members)).toBeNull();
  });

  it("retorna null quando o nome falado está ausente", () => {
    expect(matchAssigneeId(null, members)).toBeNull();
    expect(matchAssigneeId(undefined, members)).toBeNull();
  });

  it("ignora membros sem nome cadastrado", () => {
    expect(matchAssigneeId("", members)).toBeNull();
  });
});

describe("buildValidatedFieldValues", () => {
  const fields: VoiceCardFieldSpec[] = [
    { id: "field-1", fieldKey: "valor", label: "Valor", type: "currency", options: [] },
    { id: "field-2", fieldKey: "status", label: "Status", type: "single_select", options: [{ value: "urgente", label: "Urgente" }] },
    { id: "field-3", fieldKey: "descricao", label: "Descrição", type: "long_text", options: [] },
  ];

  it("mantém valores que batem com o tipo do campo", () => {
    const result = buildValidatedFieldValues({ valor: 15000, descricao: "Reforma de telhado" }, fields);
    expect(result).toEqual({ "field-1": 15000, "field-3": "Reforma de telhado" });
  });

  it("descarta um valor cujo tipo não bate, sem falhar os demais campos", () => {
    const result = buildValidatedFieldValues({ valor: "não é número", descricao: "ok" }, fields);
    expect(result).toEqual({ "field-3": "ok" });
  });

  it("descarta uma opção de single_select fora da lista de opções válidas", () => {
    const result = buildValidatedFieldValues({ status: "opcao-inexistente" }, fields);
    expect(result).toEqual({});
  });

  it("mantém uma opção de single_select válida", () => {
    const result = buildValidatedFieldValues({ status: "urgente" }, fields);
    expect(result).toEqual({ "field-2": "urgente" });
  });

  it("ignora chaves que não correspondem a nenhum field_key do pipe", () => {
    const result = buildValidatedFieldValues({ campo_inexistente: "x" }, fields);
    expect(result).toEqual({});
  });

  it("retorna objeto vazio quando não há campos extraídos", () => {
    expect(buildValidatedFieldValues(null, fields)).toEqual({});
    expect(buildValidatedFieldValues(undefined, fields)).toEqual({});
  });
});

describe("buildExtractionPrompt", () => {
  it("inclui a lista de campos e membros no prompt", () => {
    const fields: VoiceCardFieldSpec[] = [
      { id: "field-1", fieldKey: "valor", label: "Valor", type: "currency", options: [] },
    ];
    const members: OrganizationMemberOption[] = [{ id: "user-1", fullName: "Pedro Souza" }];

    const prompt = buildExtractionPrompt(fields, members);
    expect(prompt).toContain("valor");
    expect(prompt).toContain("Pedro Souza");
    expect(prompt).toContain("JSON");
  });

  it("lida com pipe sem campos e organização sem membros", () => {
    const prompt = buildExtractionPrompt([], []);
    expect(prompt).toContain("não tem campos customizados");
    expect(prompt).toContain("nenhum membro cadastrado");
  });
});

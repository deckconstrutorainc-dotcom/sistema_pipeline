import { describe, expect, it } from "vitest";

import {
  FALLBACK_RECORD_TITLE,
  archiveDatabaseFieldSchema,
  archiveDatabaseSchema,
  autofillFromRecordSchema,
  connectCardToCardSchema,
  connectCardToRecordSchema,
  createDatabaseFieldSchema,
  createDatabaseSchema,
  createRecordSchema,
  resolveRecordTitle,
  searchRecordsSchema,
  updateDatabaseFieldSchema,
  updateDatabaseSchema,
  updateRecordFieldsSchema,
  validateFieldValue,
} from "@/lib/validation/databases";

const organizationId = "11111111-1111-1111-1111-111111111111";
const databaseId = "22222222-2222-2222-2222-222222222222";
const databaseFieldId = "33333333-3333-3333-3333-333333333333";
const recordId = "44444444-4444-4444-4444-444444444444";
const cardId = "55555555-5555-5555-5555-555555555555";
const otherCardId = "66666666-6666-6666-6666-666666666666";
const pipeId = "77777777-7777-7777-7777-777777777777";
const fieldId = "88888888-8888-8888-8888-888888888888";

describe("createDatabaseSchema", () => {
  it("aceita um database válido", () => {
    const result = createDatabaseSchema.safeParse({ organizationId, name: "Fornecedores" });
    expect(result.success).toBe(true);
  });

  it("rejeita nome vazio", () => {
    const result = createDatabaseSchema.safeParse({ organizationId, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita organizationId inválido", () => {
    const result = createDatabaseSchema.safeParse({ organizationId: "não-uuid", name: "Fornecedores" });
    expect(result.success).toBe(false);
  });
});

describe("updateDatabaseSchema / archiveDatabaseSchema", () => {
  it("aceita atualização parcial (só nome)", () => {
    const result = updateDatabaseSchema.safeParse({ databaseId, name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("aceita titleFieldId nulo (remove o campo de título)", () => {
    const result = updateDatabaseSchema.safeParse({ databaseId, titleFieldId: null });
    expect(result.success).toBe(true);
  });

  it("archiveDatabaseSchema exige isArchived booleano", () => {
    expect(archiveDatabaseSchema.safeParse({ databaseId, isArchived: true }).success).toBe(true);
    expect(archiveDatabaseSchema.safeParse({ databaseId }).success).toBe(false);
  });
});

describe("createDatabaseFieldSchema", () => {
  it("aceita um campo de texto curto simples", () => {
    const result = createDatabaseFieldSchema.safeParse({
      databaseId,
      label: "Razão social",
      key: "razao_social",
      type: "short_text",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita key com caracteres inválidos", () => {
    const result = createDatabaseFieldSchema.safeParse({
      databaseId,
      label: "Razão social",
      key: "Razão Social!",
      type: "short_text",
    });
    expect(result.success).toBe(false);
  });

  it("exige ao menos uma opção para single_select", () => {
    const result = createDatabaseFieldSchema.safeParse({
      databaseId,
      label: "Status",
      key: "status",
      type: "single_select",
    });
    expect(result.success).toBe(false);
  });

  it("aceita single_select com opções", () => {
    const result = createDatabaseFieldSchema.safeParse({
      databaseId,
      label: "Status",
      key: "status",
      type: "single_select",
      options: [{ value: "ativo", label: "Ativo" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("updateDatabaseFieldSchema / archiveDatabaseFieldSchema", () => {
  it("aceita atualização parcial", () => {
    const result = updateDatabaseFieldSchema.safeParse({ databaseFieldId, databaseId, isRequired: true });
    expect(result.success).toBe(true);
  });

  it("archiveDatabaseFieldSchema exige isArchived booleano", () => {
    expect(archiveDatabaseFieldSchema.safeParse({ databaseFieldId, databaseId, isArchived: true }).success).toBe(
      true,
    );
  });
});

describe("createRecordSchema / updateRecordFieldsSchema / archiveRecordSchema / searchRecordsSchema", () => {
  it("aceita criação de registro sem valores", () => {
    expect(createRecordSchema.safeParse({ databaseId }).success).toBe(true);
  });

  it("aceita criação de registro com valores por fieldId (uuid)", () => {
    const result = createRecordSchema.safeParse({
      databaseId,
      fieldValues: { [databaseFieldId]: "Acme LTDA" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita fieldValues com chave que não é uuid", () => {
    const result = createRecordSchema.safeParse({
      databaseId,
      fieldValues: { "chave-invalida": "valor" },
    });
    expect(result.success).toBe(false);
  });

  it("updateRecordFieldsSchema aceita atualização parcial", () => {
    const result = updateRecordFieldsSchema.safeParse({ recordId, databaseId });
    expect(result.success).toBe(true);
  });

  it("searchRecordsSchema aceita busca só com databaseId (query opcional)", () => {
    const result = searchRecordsSchema.safeParse({ databaseId });
    expect(result.success).toBe(true);
    expect(result.success && result.data.includeArchived).toBe(false);
  });
});

describe("connectCardToRecordSchema / connectCardToCardSchema", () => {
  it("aceita conexão card->record válida", () => {
    const result = connectCardToRecordSchema.safeParse({ cardId, pipeId, recordId });
    expect(result.success).toBe(true);
  });

  it("aceita conexão card->card válida", () => {
    const result = connectCardToCardSchema.safeParse({ cardId, pipeId, otherCardId });
    expect(result.success).toBe(true);
  });

  it("rejeita ids inválidos", () => {
    expect(connectCardToRecordSchema.safeParse({ cardId: "x", pipeId, recordId }).success).toBe(false);
  });
});

describe("autofillFromRecordSchema", () => {
  it("exige ao menos um mapeamento", () => {
    const result = autofillFromRecordSchema.safeParse({ cardId, pipeId, recordId, mapping: [] });
    expect(result.success).toBe(false);
  });

  it("aceita mapeamento válido", () => {
    const result = autofillFromRecordSchema.safeParse({
      cardId,
      pipeId,
      recordId,
      mapping: [{ databaseFieldKey: "razao_social", fieldId }],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------
// validateFieldValue reaproveitado de fields.ts (mesma função, sem
// duplicação — CLAUDE.md §3.19) — apenas alguns casos de fumaça aqui,
// suíte completa já em tests/unit/validation-fields.test.ts.
// ---------------------------------------------------------------------

describe("validateFieldValue (reaproveitado para database_fields)", () => {
  it("valida número", () => {
    expect(validateFieldValue("number", 42).valid).toBe(true);
    expect(validateFieldValue("number", "não é número").valid).toBe(false);
  });

  it("respeita obrigatoriedade", () => {
    expect(validateFieldValue("short_text", "", { required: true }).valid).toBe(false);
    expect(validateFieldValue("short_text", "", { required: false }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------
// resolveRecordTitle — lógica pura de cálculo de título do registro.
// ---------------------------------------------------------------------

describe("resolveRecordTitle", () => {
  const shortTextField = { id: "field-a", type: "short_text" as const, position: 1 };
  const numberField = { id: "field-b", type: "number" as const, position: 0 };

  it("usa o valor do titleFieldId quando configurado e preenchido", () => {
    const title = resolveRecordTitle([shortTextField, numberField], { "field-a": "Acme LTDA" }, "field-a");
    expect(title).toBe("Acme LTDA");
  });

  it("cai para o primeiro campo texto por position quando titleFieldId não está preenchido", () => {
    const fields = [
      { id: "field-a", type: "short_text" as const, position: 2 },
      { id: "field-b", type: "long_text" as const, position: 1 },
    ];
    const title = resolveRecordTitle(fields, { "field-a": "Segundo", "field-b": "Primeiro" }, null);
    expect(title).toBe("Primeiro");
  });

  it("ignora campos arquivados ao escolher o fallback", () => {
    const fields = [
      { id: "field-a", type: "short_text" as const, position: 0, isArchived: true },
      { id: "field-b", type: "short_text" as const, position: 1 },
    ];
    const title = resolveRecordTitle(fields, { "field-a": "Arquivado", "field-b": "Ativo" }, null);
    expect(title).toBe("Ativo");
  });

  it("ignora campos não-texto (ex.: number) ao escolher o fallback", () => {
    const title = resolveRecordTitle([numberField], { "field-b": 123 }, null);
    expect(title).toBe(FALLBACK_RECORD_TITLE);
  });

  it("usa o fallback fixo quando nada está preenchido", () => {
    const title = resolveRecordTitle([shortTextField], {}, null);
    expect(title).toBe(FALLBACK_RECORD_TITLE);
  });

  it("ignora titleFieldId com valor vazio e cai para o fallback de campo texto", () => {
    const title = resolveRecordTitle([shortTextField], { "field-a": "   " }, "field-a");
    expect(title).toBe(FALLBACK_RECORD_TITLE);
  });
});

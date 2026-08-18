import { describe, expect, it } from "vitest";

import {
  createFieldSchema,
  isFieldValueEmpty,
  validateFieldValue,
} from "@/lib/validation/fields";

const pipeId = "11111111-1111-1111-1111-111111111111";

describe("createFieldSchema", () => {
  it("aceita um campo de texto curto simples", () => {
    const result = createFieldSchema.safeParse({
      pipeId,
      label: "Nome do fornecedor",
      fieldKey: "nome_fornecedor",
      type: "short_text",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita fieldKey com caracteres inválidos", () => {
    const result = createFieldSchema.safeParse({
      pipeId,
      label: "Nome",
      fieldKey: "Nome Fornecedor!",
      type: "short_text",
    });
    expect(result.success).toBe(false);
  });

  it("exige ao menos uma opção para single_select", () => {
    const result = createFieldSchema.safeParse({
      pipeId,
      label: "Status",
      fieldKey: "status",
      type: "single_select",
    });
    expect(result.success).toBe(false);
  });

  it("aceita single_select com opções", () => {
    const result = createFieldSchema.safeParse({
      pipeId,
      label: "Status",
      fieldKey: "status",
      type: "single_select",
      options: [{ value: "open", label: "Aberto" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("isFieldValueEmpty", () => {
  it("considera vazio: null, undefined, string em branco e array vazio", () => {
    expect(isFieldValueEmpty(null)).toBe(true);
    expect(isFieldValueEmpty(undefined)).toBe(true);
    expect(isFieldValueEmpty("")).toBe(true);
    expect(isFieldValueEmpty("   ")).toBe(true);
    expect(isFieldValueEmpty([])).toBe(true);
  });

  it("não considera vazio: string preenchida, número, boolean, array com item", () => {
    expect(isFieldValueEmpty("texto")).toBe(false);
    expect(isFieldValueEmpty(0)).toBe(false);
    expect(isFieldValueEmpty(false)).toBe(false);
    expect(isFieldValueEmpty(["a"])).toBe(false);
  });
});

describe("validateFieldValue", () => {
  it("exige valor quando required=true e valor está vazio", () => {
    const result = validateFieldValue("short_text", "", { required: true });
    expect(result.valid).toBe(false);
  });

  it("permite valor vazio quando required=false", () => {
    const result = validateFieldValue("short_text", "", { required: false });
    expect(result.valid).toBe(true);
  });

  it("valida número corretamente", () => {
    expect(validateFieldValue("number", 42).valid).toBe(true);
    expect(validateFieldValue("number", "42").valid).toBe(false);
  });

  it("valida e-mail", () => {
    expect(validateFieldValue("email", "a@b.com").valid).toBe(true);
    expect(validateFieldValue("email", "invalido").valid).toBe(false);
  });

  it("valida single_select contra a lista de valores permitidos", () => {
    expect(
      validateFieldValue("single_select", "open", { selectValues: ["open", "closed"] }).valid,
    ).toBe(true);
    expect(
      validateFieldValue("single_select", "unknown", { selectValues: ["open", "closed"] }).valid,
    ).toBe(false);
  });

  it("valida multi_select como array de strings", () => {
    expect(validateFieldValue("multi_select", ["a", "b"]).valid).toBe(true);
    expect(validateFieldValue("multi_select", "a").valid).toBe(false);
  });

  it("valida checkbox como boolean", () => {
    expect(validateFieldValue("checkbox", true).valid).toBe(true);
    expect(validateFieldValue("checkbox", "true").valid).toBe(false);
  });
});

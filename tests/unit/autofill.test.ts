import { describe, expect, it } from "vitest";

import { resolveAutofill, type CardFieldTarget, type RecordFieldSnapshot } from "@/server/services/autofill";

const fieldId = "11111111-1111-1111-1111-111111111111";
const fieldIdB = "22222222-2222-2222-2222-222222222222";

const recordFields: RecordFieldSnapshot[] = [
  { databaseFieldId: "db-field-1", key: "razao_social", type: "short_text", value: "Acme LTDA" },
  { databaseFieldId: "db-field-2", key: "faturamento", type: "currency", value: 15000 },
  { databaseFieldId: "db-field-3", key: "status", type: "single_select", value: "ativo" },
  { databaseFieldId: "db-field-4", key: "observacoes", type: "long_text", value: "" },
];

const cardFields: CardFieldTarget[] = [
  { fieldId, type: "short_text" },
  { fieldId: fieldIdB, type: "currency" },
];

describe("resolveAutofill", () => {
  it("copia o valor quando os tipos são iguais e o mapeamento existe", () => {
    const result = resolveAutofill([{ databaseFieldKey: "razao_social", fieldId }], recordFields, cardFields);
    expect(result.applied).toEqual([{ fieldId, value: "Acme LTDA" }]);
    expect(result.skipped).toEqual([]);
  });

  it("resolve múltiplas entradas do mapeamento de uma vez", () => {
    const result = resolveAutofill(
      [
        { databaseFieldKey: "razao_social", fieldId },
        { databaseFieldKey: "faturamento", fieldId: fieldIdB },
      ],
      recordFields,
      cardFields,
    );
    expect(result.applied).toHaveLength(2);
    expect(result.applied).toContainEqual({ fieldId, value: "Acme LTDA" });
    expect(result.applied).toContainEqual({ fieldId: fieldIdB, value: 15000 });
  });

  it("pula (não sobrescreve) quando o campo de origem não existe no record", () => {
    const result = resolveAutofill([{ databaseFieldKey: "inexistente", fieldId }], recordFields, cardFields);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([
      { fieldId, databaseFieldKey: "inexistente", reason: "Campo de origem não encontrado no registro." },
    ]);
  });

  it("pula quando o campo de destino não existe no card", () => {
    const missingFieldId = "99999999-9999-9999-9999-999999999999";
    const result = resolveAutofill(
      [{ databaseFieldKey: "razao_social", fieldId: missingFieldId }],
      recordFields,
      cardFields,
    );
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("Campo de destino não encontrado no card.");
  });

  it("NUNCA sobrescreve um campo de tipo incompatível (single_select -> short_text)", () => {
    const result = resolveAutofill([{ databaseFieldKey: "status", fieldId }], recordFields, cardFields);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0]?.reason).toContain("Tipos incompatíveis");
  });

  it("pula quando o valor de origem é inválido para o tipo de destino (currency não numérico)", () => {
    const badRecordFields: RecordFieldSnapshot[] = [
      { databaseFieldId: "db-field-2", key: "faturamento", type: "currency", value: "não é número" },
    ];
    const result = resolveAutofill([{ databaseFieldKey: "faturamento", fieldId: fieldIdB }], badRecordFields, cardFields);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it("mapeamento vazio resulta em applied e skipped vazios", () => {
    const result = resolveAutofill([], recordFields, cardFields);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

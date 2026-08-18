import { describe, expect, it } from "vitest";

import {
  createCardSchema,
  getDueStatus,
  getMissingRequiredFields,
  getSlaStatus,
  moveCardSchema,
  type PhaseFieldRequirement,
} from "@/lib/validation/cards";

const pipeId = "11111111-1111-1111-1111-111111111111";
const cardId = "22222222-2222-2222-2222-222222222222";
const phaseId = "33333333-3333-3333-3333-333333333333";

describe("createCardSchema / moveCardSchema", () => {
  it("aceita um card com título válido", () => {
    expect(createCardSchema.safeParse({ pipeId, title: "Novo contrato" }).success).toBe(true);
  });

  it("rejeita título em branco", () => {
    expect(createCardSchema.safeParse({ pipeId, title: "   " }).success).toBe(false);
  });

  it("exige uuids válidos em moveCardSchema", () => {
    expect(
      moveCardSchema.safeParse({ cardId, pipeId, targetPhaseId: phaseId }).success,
    ).toBe(true);
    expect(
      moveCardSchema.safeParse({ cardId: "not-a-uuid", pipeId, targetPhaseId: phaseId }).success,
    ).toBe(false);
  });
});

describe("getMissingRequiredFields", () => {
  const requirements: PhaseFieldRequirement[] = [
    { fieldId: "f1", fieldLabel: "Título do contrato", isRequired: true },
    { fieldId: "f2", fieldLabel: "Valor", isRequired: true },
    { fieldId: "f3", fieldLabel: "Observações", isRequired: false },
  ];

  it("retorna os campos obrigatórios sem valor preenchido", () => {
    const missing = getMissingRequiredFields(requirements, { f1: "Contrato X" });
    expect(missing.map((f) => f.fieldId)).toEqual(["f2"]);
  });

  it("retorna vazio quando todos os campos obrigatórios estão preenchidos", () => {
    const missing = getMissingRequiredFields(requirements, { f1: "Contrato X", f2: 1000 });
    expect(missing).toEqual([]);
  });

  it("ignora campos não obrigatórios mesmo vazios", () => {
    const missing = getMissingRequiredFields(requirements, { f1: "X", f2: 10, f3: "" });
    expect(missing).toEqual([]);
  });

  it("ignora campos arquivados mesmo se marcados como obrigatórios", () => {
    const archived: PhaseFieldRequirement[] = [
      { fieldId: "f4", fieldLabel: "Campo antigo", isRequired: true, isArchived: true },
    ];
    expect(getMissingRequiredFields(archived, {})).toEqual([]);
  });

  it("considera array vazio e string em branco como valor ausente", () => {
    const missing = getMissingRequiredFields(requirements, { f1: "   ", f2: [] as unknown });
    expect(missing.map((f) => f.fieldId).sort()).toEqual(["f1", "f2"]);
  });
});

describe("getDueStatus", () => {
  const now = new Date("2026-08-18T12:00:00Z");

  it("retorna 'none' quando não há prazo", () => {
    expect(getDueStatus(null, now)).toBe("none");
    expect(getDueStatus(undefined, now)).toBe("none");
  });

  it("retorna 'overdue' quando o prazo já passou", () => {
    expect(getDueStatus("2026-08-17T12:00:00Z", now)).toBe("overdue");
  });

  it("retorna 'due_soon' quando o prazo vence dentro de 24h", () => {
    expect(getDueStatus("2026-08-19T00:00:00Z", now)).toBe("due_soon");
  });

  it("retorna 'on_time' quando o prazo é distante", () => {
    expect(getDueStatus("2026-09-01T00:00:00Z", now)).toBe("on_time");
  });
});

describe("getSlaStatus", () => {
  const now = new Date("2026-08-18T12:00:00Z");

  it("retorna 'none' sem sla_hours ou sem data de entrada na fase", () => {
    expect(getSlaStatus(null, "2026-08-18T00:00:00Z", now)).toBe("none");
    expect(getSlaStatus(8, null, now)).toBe("none");
  });

  it("retorna 'within_sla' dentro do prazo configurado", () => {
    expect(getSlaStatus(24, "2026-08-18T00:00:00Z", now)).toBe("within_sla");
  });

  it("retorna 'sla_exceeded' quando o SLA foi ultrapassado", () => {
    expect(getSlaStatus(4, "2026-08-18T00:00:00Z", now)).toBe("sla_exceeded");
  });
});

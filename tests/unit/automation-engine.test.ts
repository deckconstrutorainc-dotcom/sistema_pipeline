import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  evaluateConditions,
  resolveActions,
  type AutomationAction,
  type AutomationCondition,
  type CardSnapshot,
} from "@/server/services/automation-engine";

const fieldId = "11111111-1111-1111-1111-111111111111";

describe("evaluateCondition — operadores", () => {
  it("equals: verdadeiro quando os valores são iguais (mesmo tipo)", () => {
    expect(evaluateCondition({ field: fieldId, operator: "equals", value: "aberto" }, { [fieldId]: "aberto" })).toBe(
      true,
    );
  });

  it("equals: coage tipos primitivos diferentes (string vs number)", () => {
    expect(evaluateCondition({ field: fieldId, operator: "equals", value: 5 }, { [fieldId]: "5" })).toBe(true);
  });

  it("equals: falso quando os valores diferem", () => {
    expect(evaluateCondition({ field: fieldId, operator: "equals", value: "aberto" }, { [fieldId]: "fechado" })).toBe(
      false,
    );
  });

  it("equals: null e undefined são tratados como equivalentes", () => {
    expect(evaluateCondition({ field: fieldId, operator: "equals", value: null }, {})).toBe(true);
    expect(evaluateCondition({ field: fieldId, operator: "equals", value: undefined }, { [fieldId]: null })).toBe(
      true,
    );
  });

  it("equals: compara arrays por valor (JSON)", () => {
    expect(
      evaluateCondition({ field: fieldId, operator: "equals", value: ["a", "b"] }, { [fieldId]: ["a", "b"] }),
    ).toBe(true);
    expect(
      evaluateCondition({ field: fieldId, operator: "equals", value: ["a", "b"] }, { [fieldId]: ["b", "a"] }),
    ).toBe(false);
  });

  it("not_equals: inverso de equals", () => {
    expect(
      evaluateCondition({ field: fieldId, operator: "not_equals", value: "aberto" }, { [fieldId]: "fechado" }),
    ).toBe(true);
    expect(
      evaluateCondition({ field: fieldId, operator: "not_equals", value: "aberto" }, { [fieldId]: "aberto" }),
    ).toBe(false);
  });

  it("empty: verdadeiro para ausente, null, string em branco e array vazio", () => {
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, {})).toBe(true);
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, { [fieldId]: null })).toBe(true);
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, { [fieldId]: "   " })).toBe(true);
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, { [fieldId]: [] })).toBe(true);
  });

  it("empty: falso quando há valor real (inclusive 0 e false)", () => {
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, { [fieldId]: 0 })).toBe(false);
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, { [fieldId]: false })).toBe(false);
    expect(evaluateCondition({ field: fieldId, operator: "empty" }, { [fieldId]: "valor" })).toBe(false);
  });

  it("not_empty: inverso de empty", () => {
    expect(evaluateCondition({ field: fieldId, operator: "not_empty" }, { [fieldId]: "valor" })).toBe(true);
    expect(evaluateCondition({ field: fieldId, operator: "not_empty" }, { [fieldId]: "" })).toBe(false);
  });

  it("contains: string contém substring", () => {
    expect(
      evaluateCondition({ field: fieldId, operator: "contains", value: "trato" }, { [fieldId]: "Contrato ABC" }),
    ).toBe(true);
    expect(
      evaluateCondition({ field: fieldId, operator: "contains", value: "xyz" }, { [fieldId]: "Contrato ABC" }),
    ).toBe(false);
  });

  it("contains: array contém elemento", () => {
    expect(
      evaluateCondition({ field: fieldId, operator: "contains", value: "urgente" }, { [fieldId]: ["urgente", "vip"] }),
    ).toBe(true);
    expect(
      evaluateCondition({ field: fieldId, operator: "contains", value: "novo" }, { [fieldId]: ["urgente", "vip"] }),
    ).toBe(false);
  });

  it("contains: falso para tipos que não suportam a operação (number, ausente)", () => {
    expect(evaluateCondition({ field: fieldId, operator: "contains", value: "5" }, { [fieldId]: 500 })).toBe(false);
    expect(evaluateCondition({ field: fieldId, operator: "contains", value: "x" }, {})).toBe(false);
  });

  it("greater_than / less_than: comparação numérica", () => {
    expect(evaluateCondition({ field: fieldId, operator: "greater_than", value: 100 }, { [fieldId]: 150 })).toBe(
      true,
    );
    expect(evaluateCondition({ field: fieldId, operator: "greater_than", value: 100 }, { [fieldId]: 50 })).toBe(
      false,
    );
    expect(evaluateCondition({ field: fieldId, operator: "less_than", value: 100 }, { [fieldId]: 50 })).toBe(true);
    expect(evaluateCondition({ field: fieldId, operator: "less_than", value: 100 }, { [fieldId]: 150 })).toBe(false);
  });

  it("greater_than / less_than: aceita strings numéricas", () => {
    expect(evaluateCondition({ field: fieldId, operator: "greater_than", value: "10" }, { [fieldId]: "20" })).toBe(
      true,
    );
  });

  it("greater_than / less_than: falso quando algum lado não é numérico (campo ausente ou texto)", () => {
    expect(evaluateCondition({ field: fieldId, operator: "greater_than", value: 10 }, {})).toBe(false);
    expect(
      evaluateCondition({ field: fieldId, operator: "greater_than", value: 10 }, { [fieldId]: "não é número" }),
    ).toBe(false);
    expect(evaluateCondition({ field: fieldId, operator: "less_than", value: "abc" }, { [fieldId]: 5 })).toBe(false);
  });
});

describe("evaluateConditions — combinação (E lógico)", () => {
  const snapshot: CardSnapshot = { [fieldId]: "aberto", valor: 500 };

  it("lista vazia sempre passa (sem condições configuradas)", () => {
    expect(evaluateConditions([], snapshot)).toBe(true);
  });

  it("todas as condições precisam ser verdadeiras", () => {
    const conditions: AutomationCondition[] = [
      { field: fieldId, operator: "equals", value: "aberto" },
      { field: "valor", operator: "greater_than", value: 100 },
    ];
    expect(evaluateConditions(conditions, snapshot)).toBe(true);
  });

  it("basta uma condição falhar para o resultado ser falso", () => {
    const conditions: AutomationCondition[] = [
      { field: fieldId, operator: "equals", value: "aberto" },
      { field: "valor", operator: "greater_than", value: 10000 },
    ];
    expect(evaluateConditions(conditions, snapshot)).toBe(false);
  });
});

describe("resolveActions — prevenção de loop (2ª camada, além do corte de causation_id no banco)", () => {
  it("marca 'skip' uma ação move_card cujo alvo já é a fase atual do card", () => {
    const phaseId = "22222222-2222-2222-2222-222222222222";
    const actions: AutomationAction[] = [{ type: "move_card", params: { targetPhaseId: phaseId } }];
    const resolved = resolveActions(actions, { currentPhaseId: phaseId });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.skip).toBe(true);
    expect(resolved[0]?.skipReason).toBe("loop_prevention_same_phase");
  });

  it("não marca 'skip' quando o alvo é uma fase diferente da atual", () => {
    const actions: AutomationAction[] = [
      { type: "move_card", params: { targetPhaseId: "33333333-3333-3333-3333-333333333333" } },
    ];
    const resolved = resolveActions(actions, { currentPhaseId: "22222222-2222-2222-2222-222222222222" });
    expect(resolved[0]?.skip).toBe(false);
  });

  it("nunca marca 'skip' ações que não são move_card", () => {
    const actions: AutomationAction[] = [
      { type: "add_label", params: { labelId: "l1" } },
      { type: "assign_user", params: { userId: "u1" } },
      { type: "update_field", params: { fieldId: "f1", value: "x" } },
      { type: "send_notification", params: { message: "oi" } },
    ];
    const resolved = resolveActions(actions, { currentPhaseId: "qualquer" });
    expect(resolved.every((effect) => !effect.skip)).toBe(true);
  });

  it("preserva a ordem e a quantidade de ações", () => {
    const actions: AutomationAction[] = [
      { type: "add_label", params: { labelId: "l1" } },
      { type: "move_card", params: { targetPhaseId: "p2" } },
      { type: "send_notification", params: { message: "feito" } },
    ];
    const resolved = resolveActions(actions, { currentPhaseId: "p1" });
    expect(resolved.map((r) => r.action.type)).toEqual(["add_label", "move_card", "send_notification"]);
  });
});

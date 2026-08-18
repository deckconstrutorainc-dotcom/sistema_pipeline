/**
 * Motor de automação (CLAUDE.md §11): Evento -> Condições -> Ações.
 *
 * Este arquivo contém SOMENTE lógica pura (sem I/O, sem Supabase) para que
 * seja testável de forma unitária e determinística
 * (`tests/unit/automation-engine.test.ts`). A camada com efeito colateral
 * (buscar o card real, executar as ações via RPC/tabelas, gravar status da
 * run) fica em `automation-processor.ts`, que importa e reutiliza estas
 * funções em vez de duplicar a lógica.
 */
import type { ActionType, ConditionOperator } from "@/lib/validation/automations";

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

/**
 * Estado do card no momento da avaliação: mapa de `fieldId -> valor` (os
 * mesmos valores de `card_field_values`), acrescido de chaves especiais
 * prefixadas com `__` para atributos do próprio card (fase atual, título,
 * prazo etc.) que também podem ser usados como `field` em uma condição.
 */
export type CardSnapshot = Readonly<Record<string, unknown>>;

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeForCompare(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * Igualdade "frouxa" usada por `equals`/`not_equals`: `null`/`undefined`
 * são equivalentes entre si; objetos/arrays comparam por valor (JSON);
 * primitivos usam `==` propositalmente (para que `"5"` e `5`, por exemplo,
 * vindos de um formulário HTML vs. um valor numérico já normalizado, sejam
 * tratados como iguais — o objetivo é comparar o VALOR de negócio, não o
 * tipo interno de armazenamento).
 */
function looseEquals(a: unknown, b: unknown): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === null || nb === null) return na === nb;
  if (typeof na === "object" || typeof nb === "object") {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  // eslint-disable-next-line eqeqeq -- coerção intencional, ver comentário acima.
  return na == nb;
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Avalia uma única condição contra o snapshot do card. */
export function evaluateCondition(condition: AutomationCondition, snapshot: CardSnapshot): boolean {
  const actual = snapshot[condition.field];

  switch (condition.operator) {
    case "equals":
      return looseEquals(actual, condition.value);
    case "not_equals":
      return !looseEquals(actual, condition.value);
    case "empty":
      return isEmptyValue(actual);
    case "not_empty":
      return !isEmptyValue(actual);
    case "contains": {
      if (Array.isArray(actual)) {
        return actual.some((item) => looseEquals(item, condition.value));
      }
      if (typeof actual === "string") {
        return actual.includes(String(condition.value ?? ""));
      }
      return false;
    }
    case "greater_than": {
      const a = toComparableNumber(actual);
      const b = toComparableNumber(condition.value);
      if (a === null || b === null) return false;
      return a > b;
    }
    case "less_than": {
      const a = toComparableNumber(actual);
      const b = toComparableNumber(condition.value);
      if (a === null || b === null) return false;
      return a < b;
    }
    default:
      return false;
  }
}

/**
 * Avalia a lista de condições de uma automação contra o snapshot do card.
 * Semântica: E lógico entre todas as condições (lista vazia = sem
 * condições configuradas = sempre executa, comportamento padrão de
 * "qualquer card que dispare o evento").
 */
export function evaluateConditions(
  conditions: readonly AutomationCondition[],
  snapshot: CardSnapshot,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, snapshot));
}

// ---------------------------------------------------------------------
// Resolução de ações: lógica pura de prevenção de loop (2ª camada, além do
// corte de profundidade de causation_id em emit_domain_event() no banco —
// ver comentário em 20260818091600_automation_engine_functions.sql).
//
// Estratégia: uma ação `move_card` cujo `targetPhaseId` já é a fase ATUAL
// do card (reavaliada no momento do processamento, não a fase no instante
// do evento) é marcada `skip`. Isso cobre exatamente o caso descrito no
// PROMPT_MESTRE: uma automação disparada por `card.moved` cuja ação
// `move_card` aponta para o alvo que já é a fase atual do card (o próprio
// destino do evento que a disparou) não reexecuta — vira no-op idempotente
// em vez de gerar um novo card.moved que dispararia a mesma automação de
// novo.
// ---------------------------------------------------------------------

export interface AutomationAction {
  type: ActionType;
  params: Record<string, unknown>;
}

export interface ResolveActionsContext {
  /** Fase atual do card, lida no momento do processamento (não a do evento). */
  currentPhaseId: string;
}

export interface ResolvedEffect {
  action: AutomationAction;
  skip: boolean;
  skipReason?: "loop_prevention_same_phase";
}

export function resolveActions(
  actions: readonly AutomationAction[],
  context: ResolveActionsContext,
): ResolvedEffect[] {
  return actions.map((action) => {
    if (action.type === "move_card") {
      const targetPhaseId = action.params?.["targetPhaseId"];
      if (typeof targetPhaseId === "string" && targetPhaseId === context.currentPhaseId) {
        return { action, skip: true, skipReason: "loop_prevention_same_phase" };
      }
    }
    return { action, skip: false };
  });
}

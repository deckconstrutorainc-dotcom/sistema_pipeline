import { describe, expect, it } from "vitest";

import {
  addChecklistItemSchema,
  deleteChecklistItemSchema,
  getChecklistProgress,
  toggleChecklistItemSchema,
  updateChecklistItemTitleSchema,
} from "@/lib/validation/checklists";

const pipeId = "11111111-1111-1111-1111-111111111111";
const cardId = "22222222-2222-2222-2222-222222222222";
const itemId = "33333333-3333-3333-3333-333333333333";

describe("addChecklistItemSchema", () => {
  it("aceita um item com título válido", () => {
    expect(addChecklistItemSchema.safeParse({ cardId, pipeId, title: "Enviar contrato" }).success).toBe(
      true,
    );
  });

  it("rejeita título em branco", () => {
    expect(addChecklistItemSchema.safeParse({ cardId, pipeId, title: "   " }).success).toBe(false);
  });

  it("rejeita título maior que 300 caracteres", () => {
    expect(
      addChecklistItemSchema.safeParse({ cardId, pipeId, title: "a".repeat(301) }).success,
    ).toBe(false);
  });

  it("rejeita ids inválidos", () => {
    expect(
      addChecklistItemSchema.safeParse({ cardId: "not-a-uuid", pipeId, title: "Item" }).success,
    ).toBe(false);
  });
});

describe("toggleChecklistItemSchema", () => {
  it("aceita marcar e desmarcar", () => {
    expect(
      toggleChecklistItemSchema.safeParse({ itemId, cardId, pipeId, isDone: true }).success,
    ).toBe(true);
    expect(
      toggleChecklistItemSchema.safeParse({ itemId, cardId, pipeId, isDone: false }).success,
    ).toBe(true);
  });

  it("rejeita isDone não booleano", () => {
    expect(
      toggleChecklistItemSchema.safeParse({ itemId, cardId, pipeId, isDone: "true" }).success,
    ).toBe(false);
  });
});

describe("updateChecklistItemTitleSchema", () => {
  it("aceita um novo título válido", () => {
    expect(
      updateChecklistItemTitleSchema.safeParse({ itemId, cardId, pipeId, title: "Título revisado" })
        .success,
    ).toBe(true);
  });

  it("rejeita título em branco", () => {
    expect(
      updateChecklistItemTitleSchema.safeParse({ itemId, cardId, pipeId, title: "" }).success,
    ).toBe(false);
  });
});

describe("deleteChecklistItemSchema", () => {
  it("exige uuids válidos", () => {
    expect(deleteChecklistItemSchema.safeParse({ itemId, cardId, pipeId }).success).toBe(true);
    expect(
      deleteChecklistItemSchema.safeParse({ itemId: "x", cardId, pipeId }).success,
    ).toBe(false);
  });
});

describe("getChecklistProgress", () => {
  it("retorna 0/0 para lista vazia", () => {
    expect(getChecklistProgress([])).toEqual({ done: 0, total: 0 });
  });

  it("conta itens concluídos corretamente", () => {
    const items = [{ isDone: true }, { isDone: false }, { isDone: true }];
    expect(getChecklistProgress(items)).toEqual({ done: 2, total: 3 });
  });
});

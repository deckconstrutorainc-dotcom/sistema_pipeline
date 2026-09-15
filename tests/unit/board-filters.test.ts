import { describe, expect, it } from "vitest";

import {
  applyBoardFilters,
  countActiveFilters,
  EMPTY_FILTERS,
  type BoardFilters,
} from "@/components/kanban/board-toolbar";
import type { CardSummary } from "@/server/queries/pipes";

const NOW = new Date("2026-09-15T12:00:00Z");
const ANA = "11111111-1111-1111-1111-111111111111";
const BETO = "22222222-2222-2222-2222-222222222222";
const URGENTE = "aaaaaaaa-0000-0000-0000-000000000001";
const ELETRICA = "aaaaaaaa-0000-0000-0000-000000000002";

function card(overrides: Partial<CardSummary> & { number: number; title: string }): CardSummary {
  return {
    id: `card-${overrides.number}`,
    pipeId: "pipe-1",
    currentPhaseId: "phase-1",
    dueDate: null,
    isArchived: false,
    isDone: false,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    labelIds: [],
    assignees: [],
    attachmentCount: 0,
    commentCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    summaryFields: [],
    ...overrides,
  };
}

const cards: CardSummary[] = [
  card({ number: 1, title: "Cimento CP-II 400 sacos", assignees: [{ id: ANA, fullName: "Ana" }] }),
  card({
    number: 2,
    title: "Fiação elétrica 3.000m",
    labelIds: [ELETRICA],
    assignees: [{ id: BETO, fullName: "Beto" }],
    // Vencido há 2 dias.
    dueDate: "2026-09-13T12:00:00Z",
  }),
  card({
    number: 3,
    title: "Tubos PVC 100mm",
    labelIds: [URGENTE, ELETRICA],
    // Vence em 24h.
    dueDate: "2026-09-16T12:00:00Z",
  }),
  card({
    number: 142,
    title: "Janelas de alumínio",
    assignees: [{ id: ANA, fullName: "Ana" }],
    // Vence em 10 dias: fora da janela de "vencem em breve".
    dueDate: "2026-09-25T12:00:00Z",
  }),
];

function filters(overrides: Partial<BoardFilters> = {}): BoardFilters {
  return { ...EMPTY_FILTERS, ...overrides };
}

describe("filtros do quadro", () => {
  it("sem filtro, devolve tudo", () => {
    expect(applyBoardFilters(cards, EMPTY_FILTERS, null, NOW)).toHaveLength(4);
  });

  describe("busca", () => {
    it("acha por trecho do título, ignorando maiúsculas", () => {
      const result = applyBoardFilters(cards, filters({ query: "PVC" }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([3]);
    });

    it("acha por número exato", () => {
      const result = applyBoardFilters(cards, filters({ query: "142" }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([142]);
    });

    it("aceita o número com # na frente", () => {
      const result = applyBoardFilters(cards, filters({ query: "#2" }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([2]);
    });

    it("ignora espaços em volta", () => {
      expect(applyBoardFilters(cards, filters({ query: "  tubos  " }), null, NOW)).toHaveLength(1);
    });

    it("sem resultado devolve lista vazia, não tudo", () => {
      expect(applyBoardFilters(cards, filters({ query: "inexistente" }), null, NOW)).toHaveLength(0);
    });
  });

  describe("prazo", () => {
    it("atrasadas traz só o que já venceu", () => {
      const result = applyBoardFilters(cards, filters({ due: "overdue" }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([2]);
    });

    it("vencem em breve não inclui as já atrasadas", () => {
      const result = applyBoardFilters(cards, filters({ due: "due_soon" }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([3]);
    });

    it("vencem em breve não inclui prazo distante", () => {
      const result = applyBoardFilters(cards, filters({ due: "due_soon" }), null, NOW);
      expect(result.map((c) => c.number)).not.toContain(142);
    });

    it("sem prazo traz só quem não tem data", () => {
      const result = applyBoardFilters(cards, filters({ due: "no_date" }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([1]);
    });
  });

  describe("etiquetas e responsáveis", () => {
    it("etiqueta filtra por qualquer uma das escolhidas", () => {
      const result = applyBoardFilters(cards, filters({ labelIds: [URGENTE] }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([3]);
    });

    it("duas etiquetas trazem quem tem pelo menos uma", () => {
      const result = applyBoardFilters(
        cards,
        filters({ labelIds: [URGENTE, ELETRICA] }),
        null,
        NOW,
      );
      expect(result.map((c) => c.number)).toEqual([2, 3]);
    });

    it("responsável filtra por atribuição", () => {
      const result = applyBoardFilters(cards, filters({ assigneeIds: [ANA] }), null, NOW);
      expect(result.map((c) => c.number)).toEqual([1, 142]);
    });

    it("'minhas' usa o usuário logado", () => {
      const result = applyBoardFilters(cards, filters({ onlyMine: true }), BETO, NOW);
      expect(result.map((c) => c.number)).toEqual([2]);
    });

    it("'minhas' sem usuário logado não filtra nada", () => {
      // Evita esvaziar o quadro por engano quando o id não chegou.
      expect(applyBoardFilters(cards, filters({ onlyMine: true }), null, NOW)).toHaveLength(4);
    });
  });

  it("combina filtros com E, não com OU", () => {
    const result = applyBoardFilters(
      cards,
      filters({ labelIds: [ELETRICA], due: "overdue" }),
      null,
      NOW,
    );
    expect(result.map((c) => c.number)).toEqual([2]);
  });

  describe("countActiveFilters", () => {
    it("não conta a busca — ela tem indicação própria na barra", () => {
      expect(countActiveFilters(filters({ query: "algo" }))).toBe(0);
    });

    it("conta cada dimensão uma vez, não por item escolhido", () => {
      expect(countActiveFilters(filters({ labelIds: [URGENTE, ELETRICA] }))).toBe(1);
    });

    it("soma as dimensões ativas", () => {
      expect(
        countActiveFilters(filters({ labelIds: [URGENTE], due: "overdue", onlyMine: true })),
      ).toBe(3);
    });
  });
});

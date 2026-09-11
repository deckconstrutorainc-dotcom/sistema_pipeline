import { describe, expect, it } from "vitest";

import {
  averageTimeInPhase,
  completionRate,
  countCardsByPhase,
  summarizeSla,
  type PhaseChangedActivity,
  type ReportCardSnapshot,
  type ReportPhaseSnapshot,
} from "@/server/services/reporting";

const phaseA: ReportPhaseSnapshot = {
  id: "phase-a",
  name: "A fazer",
  position: 0,
  isFinal: false,
  slaHours: 24,
};
const phaseB: ReportPhaseSnapshot = {
  id: "phase-b",
  name: "Em andamento",
  position: 1,
  isFinal: false,
  slaHours: null,
};
const phaseC: ReportPhaseSnapshot = {
  id: "phase-c",
  name: "Concluído",
  position: 2,
  isFinal: true,
  slaHours: null,
};
const phases = [phaseA, phaseB, phaseC];

function card(overrides: Partial<ReportCardSnapshot> & { id: string }): ReportCardSnapshot {
  return {
    currentPhaseId: phaseA.id,
    isArchived: false,
    isDone: false,
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    phaseEnteredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("countCardsByPhase", () => {
  it("conta cards não arquivados por fase, na ordem das fases", () => {
    const cards = [
      card({ id: "1", currentPhaseId: phaseA.id }),
      card({ id: "2", currentPhaseId: phaseA.id }),
      card({ id: "3", currentPhaseId: phaseB.id }),
    ];

    const result = countCardsByPhase(cards, phases);

    expect(result).toEqual([
      { phaseId: phaseA.id, phaseName: phaseA.name, count: 2 },
      { phaseId: phaseB.id, phaseName: phaseB.name, count: 1 },
      { phaseId: phaseC.id, phaseName: phaseC.name, count: 0 },
    ]);
  });

  it("ignora cards arquivados", () => {
    const cards = [card({ id: "1", currentPhaseId: phaseA.id, isArchived: true })];
    const result = countCardsByPhase(cards, phases);
    expect(result.find((r) => r.phaseId === phaseA.id)?.count).toBe(0);
  });

  it("retorna zero para todas as fases quando não há cards", () => {
    const result = countCardsByPhase([], phases);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });
});

describe("completionRate", () => {
  it("calcula a taxa de conclusão sobre cards não arquivados", () => {
    const cards = [
      card({ id: "1", isDone: true }),
      card({ id: "2", isDone: true }),
      card({ id: "3", isDone: false }),
      card({ id: "4", isDone: false, isArchived: true }), // não entra no total
    ];

    const result = completionRate(cards);
    expect(result).toEqual({ total: 3, completed: 2, rate: 2 / 3 });
  });

  it("retorna rate null quando não há cards ativos", () => {
    expect(completionRate([])).toEqual({ total: 0, completed: 0, rate: null });
    expect(completionRate([card({ id: "1", isArchived: true })])).toEqual({
      total: 0,
      completed: 0,
      rate: null,
    });
  });
});

describe("summarizeSla", () => {
  const phasesById = new Map(phases.map((p) => [p.id, p]));
  const now = new Date("2026-01-05T00:00:00.000Z");

  it("conta cards atrasados (dueDate no passado)", () => {
    const cards = [
      card({ id: "1", dueDate: "2026-01-01T00:00:00.000Z" }), // vencido
      card({ id: "2", dueDate: "2026-02-01T00:00:00.000Z" }), // no prazo
    ];

    const result = summarizeSla(cards, phasesById, now);
    expect(result.total).toBe(2);
    expect(result.overdue).toBe(1);
  });

  it("conta cards com SLA de fase excedido, usando slaHours da fase atual", () => {
    // phaseA tem sla_hours = 24; card entrou há 5 dias -> excedeu.
    const cards = [
      card({ id: "1", currentPhaseId: phaseA.id, phaseEnteredAt: "2026-01-01T00:00:00.000Z" }),
      // phaseB não tem SLA configurado -> nunca excede.
      card({ id: "2", currentPhaseId: phaseB.id, phaseEnteredAt: "2026-01-01T00:00:00.000Z" }),
    ];

    const result = summarizeSla(cards, phasesById, now);
    expect(result.slaExceeded).toBe(1);
  });

  it("ignora cards arquivados", () => {
    const cards = [card({ id: "1", isArchived: true, dueDate: "2026-01-01T00:00:00.000Z" })];
    const result = summarizeSla(cards, phasesById, now);
    expect(result.total).toBe(0);
    expect(result.overdue).toBe(0);
  });
});

describe("averageTimeInPhase", () => {
  it("calcula o tempo médio entre entrada e saída de uma fase, a partir de phase_changed", () => {
    const cards: ReportCardSnapshot[] = [
      card({ id: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "2", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];

    // Card 1: entrou em A no created_at, saiu para B 2h depois, saiu para C 4h depois disso.
    // Card 2: entrou em A no created_at, saiu para B 6h depois (nenhuma saída registrada de B).
    const activities: PhaseChangedActivity[] = [
      { cardId: "1", fromPhaseId: phaseA.id, toPhaseId: phaseB.id, createdAt: "2026-01-01T02:00:00.000Z" },
      { cardId: "1", fromPhaseId: phaseB.id, toPhaseId: phaseC.id, createdAt: "2026-01-01T06:00:00.000Z" },
      { cardId: "2", fromPhaseId: phaseA.id, toPhaseId: phaseB.id, createdAt: "2026-01-01T06:00:00.000Z" },
    ];

    const result = averageTimeInPhase(cards, phases, activities);

    const phaseAResult = result.find((r) => r.phaseId === phaseA.id);
    // Card 1: 2h em A. Card 2: 6h em A. Média = 4h.
    expect(phaseAResult?.avgHours).toBe(4);
    expect(phaseAResult?.sampleSize).toBe(2);

    const phaseBResult = result.find((r) => r.phaseId === phaseB.id);
    // Só card 1 tem uma saída registrada de B (4h, de 02:00 a 06:00). Card 2 ainda está em B (ignorado).
    expect(phaseBResult?.avgHours).toBe(4);
    expect(phaseBResult?.sampleSize).toBe(1);

    const phaseCResult = result.find((r) => r.phaseId === phaseC.id);
    expect(phaseCResult?.avgHours).toBeNull();
    expect(phaseCResult?.sampleSize).toBe(0);
  });

  it("retorna avgHours null para fases sem nenhuma amostra", () => {
    const result = averageTimeInPhase([], phases, []);
    expect(result.every((r) => r.avgHours === null && r.sampleSize === 0)).toBe(true);
  });
});

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

import { CardTile } from "@/components/kanban/card-tile";
import { KanbanColumn } from "@/components/kanban/column";
import { moveCard } from "@/server/actions/cards";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface KanbanBoardProps {
  pipeId: string;
  phases: PhaseSummary[];
  initialCards: CardSummary[];
  labels: LabelSummary[];
}

export function KanbanBoard({ pipeId, phases, initialCards, labels }: KanbanBoardProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const cardsByPhase = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    for (const phase of phases) map.set(phase.id, []);
    for (const card of cards) {
      const list = map.get(card.currentPhaseId);
      if (list) list.push(card);
      else map.set(card.currentPhaseId, [card]);
    }
    return map;
  }, [cards, phases]);

  const activeCard = activeCardId ? cards.find((c) => c.id === activeCardId) ?? null : null;

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const targetPhaseId = over.id as string;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.currentPhaseId === targetPhaseId) return;

    const previousPhaseId = card.currentPhaseId;
    setError(null);

    // Atualização otimista da UI.
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, currentPhaseId: targetPhaseId } : c)),
    );

    const result = await moveCard({ cardId, pipeId, targetPhaseId });

    if (!result.success) {
      // Rollback: falha do servidor (ex.: campo obrigatório faltando)
      // reverte a UI para o estado anterior — CLAUDE.md/PROMPT_MESTRE M2:
      // "rollback em falha".
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, currentPhaseId: previousPhaseId } : c)),
      );
      setError(result.error ?? "Não foi possível mover o card.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveCardId(event.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveCardId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {phases.map((phase) => (
            <KanbanColumn
              key={phase.id}
              phase={phase}
              cards={cardsByPhase.get(phase.id) ?? []}
              pipeId={pipeId}
              labelsById={labelsById}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <CardTile card={activeCard} pipeId={pipeId} labelsById={labelsById} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

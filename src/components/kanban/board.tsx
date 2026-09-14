"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

import { CardTile } from "@/components/kanban/card-tile";
import { KanbanColumn } from "@/components/kanban/column";
import { TooltipProvider } from "@/components/ui/tooltip";
import { moveCard } from "@/server/actions/cards";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface KanbanBoardProps {
  pipeId: string;
  phases: PhaseSummary[];
  initialCards: CardSummary[];
  labels: LabelSummary[];
  canManagePhases?: boolean;
  /** Habilita "Atribuir a mim" no menu de ações do card. */
  currentUserId?: string | null;
}

export function KanbanBoard({
  pipeId,
  phases,
  initialCards,
  labels,
  canManagePhases = false,
  currentUserId = null,
}: KanbanBoardProps) {
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
    // TooltipProvider envolve o quadro inteiro: os tooltips dos indicadores
    // do card (checklist, comentários, SLA) precisam de um provider comum
    // para compartilhar o atraso de abertura.
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <div className="space-y-2">
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-ui-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          onDragStart={(event) => setActiveCardId(event.active.id as string)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveCardId(null)}
        >
          {/* Colunas lado a lado com scroll horizontal — padrão universal de
              Kanban em telas estreitas (Trello/Pipefy também fazem isso; não
              é cópia de identidade visual, CLAUDE.md §30). `snap-x` "prende"
              cada coluna ao rolar em touch, deixando a navegação mais fluida
              no celular. */}
          <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto rounded-lg bg-board p-2.5">
            {phases.map((phase) => (
              <KanbanColumn
                key={phase.id}
                phase={phase}
                phases={phases}
                cards={cardsByPhase.get(phase.id) ?? []}
                pipeId={pipeId}
                labelsById={labelsById}
                canManagePhases={canManagePhases}
                currentUserId={currentUserId}
                onActionError={setError}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard ? (
              <CardTile
                card={activeCard}
                pipeId={pipeId}
                labelsById={labelsById}
                phase={phases.find((p) => p.id === activeCard.currentPhaseId)}
                isDragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </TooltipProvider>
  );
}

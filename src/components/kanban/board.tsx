"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

import { CardTile } from "@/components/kanban/card-tile";
import {
  applyBoardFilters,
  BoardToolbar,
  EMPTY_FILTERS,
  type BoardFilters,
} from "@/components/kanban/board-toolbar";
import { KanbanColumn } from "@/components/kanban/column";
import { useToast } from "@/components/ui/toast";
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
  /** Admin da organização: habilita a exclusão no menu do card. */
  canDelete?: boolean;
}

export function KanbanBoard({
  pipeId,
  phases,
  initialCards,
  labels,
  canManagePhases = false,
  currentUserId = null,
  canDelete = false,
}: KanbanBoardProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  // Erros viram toast: o aviso inline ficava acima do quadro e podia estar
  // fora da área visível depois do scroll horizontal das colunas.
  const { error: showError } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const visibleCards = useMemo(
    () => applyBoardFilters(cards, filters, currentUserId),
    [cards, filters, currentUserId],
  );

  // Todas as pessoas atribuídas em algum card do pipe — é a lista que o
  // filtro por responsável oferece.
  const people = useMemo(() => {
    const byId = new Map<string, { id: string; fullName: string | null }>();
    for (const card of cards) {
      for (const person of card.assignees) byId.set(person.id, person);
    }
    return [...byId.values()].sort((a, b) =>
      (a.fullName ?? "").localeCompare(b.fullName ?? "", "pt-BR"),
    );
  }, [cards]);

  const cardsByPhase = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    for (const phase of phases) map.set(phase.id, []);
    for (const card of visibleCards) {
      const list = map.get(card.currentPhaseId);
      if (list) list.push(card);
      else map.set(card.currentPhaseId, [card]);
    }
    return map;
  }, [visibleCards, phases]);

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
      showError(result.error ?? "Não foi possível mover o card.");
      return;
    }

    router.refresh();
  }

  return (
    // TooltipProvider envolve o quadro inteiro: os tooltips dos indicadores
    // do card (checklist, comentários, SLA) precisam de um provider comum
    // para compartilhar o atraso de abertura.
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <div className="space-y-2.5">
        <BoardToolbar
          filters={filters}
          onChange={setFilters}
          labels={labels}
          people={people}
          total={cards.length}
          visible={visibleCards.length}
          currentUserId={currentUserId}
        />

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
                canDelete={canDelete}
                onActionError={showError}
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

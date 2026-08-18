"use client";

import { useDroppable } from "@dnd-kit/core";

import { CardTile } from "@/components/kanban/card-tile";
import { cn } from "@/lib/utils";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface ColumnProps {
  phase: PhaseSummary;
  cards: CardSummary[];
  pipeId: string;
  labelsById: Map<string, LabelSummary>;
}

export function KanbanColumn({ phase, cards, pipeId, labelsById }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: phase.id, data: { phaseId: phase.id } });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
        isOver && "border-primary bg-muted/60",
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{phase.name}</span>
          {phase.isFinal ? <span className="text-xs text-muted-foreground">(final)</span> : null}
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2" style={{ minHeight: 80 }}>
        {cards.length === 0 ? (
          <p className="p-2 text-center text-xs text-muted-foreground">Nenhum card nesta fase.</p>
        ) : (
          cards.map((card) => (
            <CardTile key={card.id} card={card} pipeId={pipeId} labelsById={labelsById} />
          ))
        )}
      </div>
    </div>
  );
}

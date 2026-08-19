"use client";

import { useDroppable } from "@dnd-kit/core";

import { CardTile } from "@/components/kanban/card-tile";
import { PhaseColorPicker } from "@/components/forms/phase-color-picker";
import { cn } from "@/lib/utils";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface ColumnProps {
  phase: PhaseSummary;
  cards: CardSummary[];
  pipeId: string;
  labelsById: Map<string, LabelSummary>;
  canManagePhases: boolean;
}

export function KanbanColumn({ phase, cards, pipeId, labelsById, canManagePhases }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: phase.id, data: { phaseId: phase.id } });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col overflow-visible rounded-lg border bg-muted/30 transition-colors",
        isOver && "border-primary bg-muted/60",
      )}
      style={{ borderTopWidth: 3, borderTopColor: phase.color ?? "transparent" }}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-background/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {canManagePhases ? (
            <PhaseColorPicker phaseId={phase.id} pipeId={pipeId} currentColor={phase.color} />
          ) : phase.color ? (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: phase.color }}
              aria-hidden
            />
          ) : null}
          <span className="truncate text-sm font-semibold">{phase.name}</span>
          {phase.isFinal ? (
            <span className="shrink-0 text-xs text-muted-foreground">(final)</span>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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

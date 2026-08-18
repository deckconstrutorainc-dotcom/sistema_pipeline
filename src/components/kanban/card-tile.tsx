"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDueStatus } from "@/lib/validation/cards";
import type { CardSummary, LabelSummary } from "@/server/queries/pipes";

interface CardTileProps {
  card: CardSummary;
  pipeId: string;
  labelsById: Map<string, LabelSummary>;
  isDragOverlay?: boolean;
}

const dueStatusLabel: Record<string, string> = {
  overdue: "Atrasado",
  due_soon: "Vence em breve",
};

export function CardTile({ card, pipeId, labelsById, isDragOverlay = false }: CardTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { cardId: card.id, fromPhaseId: card.currentPhaseId },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const dueStatus = getDueStatus(card.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab space-y-2 rounded-md border bg-card p-3 text-sm shadow-sm active:cursor-grabbing",
        (isDragging || isDragOverlay) && "opacity-90 ring-2 ring-ring",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pipes/${pipeId}/cards/${card.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium hover:underline"
        >
          #{card.number} {card.title}
        </Link>
      </div>

      {card.labelIds.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {card.labelIds.map((labelId) => {
            const label = labelsById.get(labelId);
            if (!label) return null;
            return (
              <span
                key={labelId}
                className="rounded-full px-2 py-0.5 text-xs text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{card.assigneeIds.length} responsável(is)</span>
        {dueStatus === "overdue" || dueStatus === "due_soon" ? (
          <Badge variant={dueStatus === "overdue" ? "destructive" : "warning"}>
            {dueStatusLabel[dueStatus]}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

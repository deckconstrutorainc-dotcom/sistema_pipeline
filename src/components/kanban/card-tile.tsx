"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import {
  Calendar,
  CheckSquare,
  Hash,
  List,
  Mail,
  Paperclip,
  Phone,
  DollarSign,
  Type,
  User as UserIcon,
} from "lucide-react";

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

// Um ícone pequeno por tipo de campo — só uma pista visual de leitura
// rápida no card-tile, não substitui o label do campo (que também é
// exibido). Cobre os tipos de src/lib/validation/fields.ts::fieldTypes.
const fieldTypeIcons: Record<string, typeof Type> = {
  short_text: Type,
  long_text: Type,
  number: Hash,
  currency: DollarSign,
  date: Calendar,
  datetime: Calendar,
  single_select: List,
  multi_select: List,
  checkbox: CheckSquare,
  email: Mail,
  phone: Phone,
  user: UserIcon,
  attachment: Paperclip,
};

function formatSummaryFieldValue(type: string, value: unknown): string {
  if (type === "currency" && typeof value === "number") {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (type === "number" && typeof value === "number") {
    return value.toLocaleString("pt-BR");
  }
  if ((type === "date" || type === "datetime") && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return type === "date"
        ? parsed.toLocaleDateString("pt-BR")
        : parsed.toLocaleString("pt-BR");
    }
  }
  if (type === "checkbox") {
    return value ? "Sim" : "Não";
  }
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  return String(value);
}

/** Iniciais (até 2 letras) para o avatar do responsável, sem foto real (CLAUDE.md §30). */
function initials(name: string | null): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

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
          className="font-medium leading-snug hover:underline"
        >
          {card.title}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">#{card.number}</span>
      </div>

      {card.summaryFields.length > 0 ? (
        <div className="space-y-1">
          {card.summaryFields.map((f) => {
            const Icon = fieldTypeIcons[f.type] ?? Type;
            return (
              <div
                key={f.fieldId}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                title={f.label}
              >
                <Icon className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{formatSummaryFieldValue(f.type, f.value)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

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

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center">
          {card.assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">Sem responsável</span>
          ) : (
            <div className="flex -space-x-2">
              {card.assignees.slice(0, 4).map((assignee) => (
                <span
                  key={assignee.id}
                  title={assignee.fullName ?? "Sem nome"}
                  className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-semibold text-secondary-foreground"
                >
                  {initials(assignee.fullName)}
                </span>
              ))}
              {card.assignees.length > 4 ? (
                <span className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
                  +{card.assignees.length - 4}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {card.attachmentCount > 0 ? (
            <span className="flex items-center gap-1" title="Anexos">
              <Paperclip className="size-3" aria-hidden />
              {card.attachmentCount}
            </span>
          ) : null}
          {dueStatus === "overdue" || dueStatus === "due_soon" ? (
            <Badge variant={dueStatus === "overdue" ? "destructive" : "warning"}>
              {dueStatusLabel[dueStatus]}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

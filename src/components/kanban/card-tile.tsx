"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import {
  AlarmClock,
  Calendar,
  CheckSquare,
  DollarSign,
  Hash,
  List,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  Type,
  User as UserIcon,
} from "lucide-react";

import { AvatarStack } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { getLabelStyle } from "@/lib/phase-colors";
import { cn } from "@/lib/utils";
import { getDueStatus, getSlaStatus } from "@/lib/validation/cards";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface CardTileProps {
  card: CardSummary;
  pipeId: string;
  labelsById: Map<string, LabelSummary>;
  /** Fase atual — usada só para avaliar o SLA. */
  phase?: PhaseSummary;
  isDragOverlay?: boolean;
}

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

/** Data curta (12/03) — o ano só aparece quando não é o corrente. */
function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function CardTile({
  card,
  pipeId,
  labelsById,
  phase,
  isDragOverlay = false,
}: CardTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { cardId: card.id, fromPhaseId: card.currentPhaseId },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const dueStatus = getDueStatus(card.dueDate);

  // PROVISÓRIO: `updatedAt` é uma aproximação da entrada do card na fase — a
  // mesma convenção já usada por `check_sla_exceeded()` no banco. Qualquer
  // edição no card reinicia o relógio, o que subestima o atraso. A correção
  // definitiva exige uma coluna `phase_entered_at` real em `cards`, junto do
  // SLA em horário útil.
  const slaStatus = getSlaStatus(phase?.slaHours, card.updatedAt);

  const labels = card.labelIds
    .map((id) => labelsById.get(id))
    .filter((label): label is LabelSummary => Boolean(label));

  // A borda esquerda herda a cor da primeira label: dá varredura visual
  // imediata na coluna sem poluir o cartão.
  const accentColor = labels[0]?.color ?? null;

  const hasChecklist = card.checklistTotal > 0;
  const checklistComplete = hasChecklist && card.checklistDone === card.checklistTotal;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...(accentColor ? { borderLeftColor: accentColor, borderLeftWidth: 3 } : {}),
      }}
      {...attributes}
      {...listeners}
      className={cn(
        // `touch-none` (touch-action: none) evita que o gesto de arrastar
        // em touch seja interpretado como rolagem da página pelo
        // navegador — necessário para o drag-and-drop (dnd-kit
        // `PointerSensor`, que já cobre mouse e touch) funcionar bem em
        // celular.
        "group cursor-grab touch-none space-y-1.5 rounded-md border border-tile-border bg-tile p-2.5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md active:cursor-grabbing",
        (isDragging || isDragOverlay) && "rotate-1 opacity-90 shadow-lg ring-2 ring-ring",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pipes/${pipeId}/cards/${card.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-ui-md font-medium leading-snug hover:underline"
        >
          {card.title}
        </Link>
        <span className="tabular shrink-0 text-ui-2xs text-muted-foreground">#{card.number}</span>
      </div>

      {labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className="rounded border px-1.5 py-px text-ui-2xs font-medium"
              style={getLabelStyle(label.color)}
            >
              {label.name}
            </span>
          ))}
        </div>
      ) : null}

      {card.summaryFields.length > 0 ? (
        <div className="space-y-0.5">
          {card.summaryFields.map((f) => {
            const Icon = fieldTypeIcons[f.type] ?? Type;
            return (
              <div
                key={f.fieldId}
                className="flex items-center gap-1.5 text-ui-xs text-muted-foreground"
                title={f.label}
              >
                <Icon className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{formatSummaryFieldValue(f.type, f.value)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        {card.assignees.length === 0 ? (
          <span className="text-ui-2xs text-muted-foreground">Sem responsável</span>
        ) : (
          <AvatarStack people={card.assignees} max={3} size="sm" />
        )}

        <div className="flex items-center gap-1.5 text-ui-2xs text-muted-foreground">
          {hasChecklist ? (
            <Tooltip content={`Checklist: ${card.checklistDone} de ${card.checklistTotal}`}>
              <span
                className={cn(
                  "tabular flex items-center gap-0.5",
                  checklistComplete && "text-emerald-700",
                )}
              >
                <CheckSquare className="size-3" aria-hidden />
                {card.checklistDone}/{card.checklistTotal}
              </span>
            </Tooltip>
          ) : null}

          {card.commentCount > 0 ? (
            <Tooltip content={`${card.commentCount} comentário(s)`}>
              <span className="tabular flex items-center gap-0.5">
                <MessageSquare className="size-3" aria-hidden />
                {card.commentCount}
              </span>
            </Tooltip>
          ) : null}

          {card.attachmentCount > 0 ? (
            <Tooltip content={`${card.attachmentCount} anexo(s)`}>
              <span className="tabular flex items-center gap-0.5">
                <Paperclip className="size-3" aria-hidden />
                {card.attachmentCount}
              </span>
            </Tooltip>
          ) : null}

          {slaStatus === "sla_exceeded" ? (
            <Tooltip content={`SLA da fase excedido (${phase?.slaHours}h)`}>
              <span className="flex items-center text-destructive">
                <AlarmClock className="size-3.5" aria-hidden />
              </span>
            </Tooltip>
          ) : null}

          {card.dueDate && (dueStatus === "overdue" || dueStatus === "due_soon") ? (
            <Tooltip content={dueStatus === "overdue" ? "Prazo vencido" : "Vence em breve"}>
              <span
                className={cn(
                  "tabular flex items-center gap-0.5 font-medium",
                  dueStatus === "overdue" ? "text-destructive" : "text-amber-700",
                )}
              >
                <Calendar className="size-3" aria-hidden />
                {formatShortDate(card.dueDate)}
              </span>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  );
}

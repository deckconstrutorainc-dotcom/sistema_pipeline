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

import { CardActionsMenu } from "@/components/kanban/card-actions-menu";
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
  /** Todas as fases do pipe, para o submenu "Mover para". */
  phases?: PhaseSummary[];
  currentUserId?: string | null;
  onActionError?: (message: string) => void;
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
  phases,
  currentUserId,
  onActionError,
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

  // Bolinha ao lado do título, na cor da primeira etiqueta: dá varredura
  // visual imediata na coluna sem poluir o cartão.
  const accentColor = labels[0]?.color ?? null;

  const hasChecklist = card.checklistTotal > 0;
  const checklistComplete = hasChecklist && card.checklistDone === card.checklistTotal;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        // `touch-none` (touch-action: none) evita que o gesto de arrastar
        // em touch seja interpretado como rolagem da página pelo
        // navegador — necessário para o drag-and-drop (dnd-kit
        // `PointerSensor`, que já cobre mouse e touch) funcionar bem em
        // celular.
        "group cursor-grab touch-none space-y-2 rounded-lg border border-tile-border bg-tile p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all hover:-translate-y-px hover:border-border hover:shadow-[0_4px_16px_-4px_rgba(16,24,40,0.12)] active:cursor-grabbing",
        (isDragging || isDragOverlay) && "rotate-1 opacity-90 shadow-lg ring-2 ring-ring",
      )}
    >
      {/* Cabeçalho: bolinha da etiqueta + título, número e menu. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {accentColor ? (
            <span
              className="mt-1 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accentColor }}
              aria-hidden
            />
          ) : null}
          <Link
            href={`/pipes/${pipeId}/cards/${card.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-ui-md font-semibold leading-snug hover:underline"
          >
            {card.title}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="tabular text-ui-2xs text-muted-foreground">#{card.number}</span>
          {phases && !isDragOverlay ? (
            <CardActionsMenu
              cardId={card.id}
              pipeId={pipeId}
              currentPhaseId={card.currentPhaseId}
              phases={phases}
              currentUserId={currentUserId ?? null}
              isAssignedToMe={
                currentUserId ? card.assignees.some((a) => a.id === currentUserId) : false
              }
              onError={onActionError}
            />
          ) : null}
        </div>
      </div>

      {/* Campos resumidos numa linha só, separados por ponto — o formato
          "valor · data" do modelo. Duas linhas empilhadas ocupavam altura
          demais e faziam caber menos cards na coluna. */}
      {card.summaryFields.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-ui-xs text-muted-foreground">
          {card.summaryFields.map((f, index) => {
            const Icon = fieldTypeIcons[f.type] ?? Type;
            return (
              <span key={f.fieldId} className="flex items-center gap-1" title={f.label}>
                {index > 0 ? <span className="text-muted-foreground/50">·</span> : null}
                <Icon className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{formatSummaryFieldValue(f.type, f.value)}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Etiquetas como pílulas, separadas do conteúdo por uma divisória —
          é o rodapé de categoria do modelo. */}
      {labels.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-t border-border/60 pt-2">
          {labels.map((label) => (
            <span
              key={label.id}
              className="rounded-md border px-1.5 py-0.5 text-ui-2xs font-medium"
              style={getLabelStyle(label.color)}
            >
              {label.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
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

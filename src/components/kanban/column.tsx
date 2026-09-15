"use client";

import { useDroppable } from "@dnd-kit/core";
import { AlarmClock, Flag } from "lucide-react";

import { CardTile } from "@/components/kanban/card-tile";
import { PhaseColorPicker } from "@/components/forms/phase-color-picker";
import { Tooltip } from "@/components/ui/tooltip";
import { getPhaseColor } from "@/lib/phase-colors";
import { cn } from "@/lib/utils";
import { getSlaStatus } from "@/lib/validation/cards";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface ColumnProps {
  phase: PhaseSummary;
  /** Todas as fases do pipe, para o submenu "Mover para" do card. */
  phases: PhaseSummary[];
  cards: CardSummary[];
  pipeId: string;
  labelsById: Map<string, LabelSummary>;
  canManagePhases: boolean;
  currentUserId?: string | null;
  onActionError?: (message: string) => void;
}

export function KanbanColumn({
  phase,
  phases,
  cards,
  pipeId,
  labelsById,
  canManagePhases,
  currentUserId,
  onActionError,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: phase.id, data: { phaseId: phase.id } });
  const color = getPhaseColor(phase.color);

  // Ver a nota em `card-tile.tsx`: `updatedAt` é aproximação provisória da
  // entrada na fase.
  const breachedCount = cards.filter(
    (card) => getSlaStatus(phase.slaHours, card.updatedAt) === "sla_exceeded",
  ).length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Em mobile a coluna ocupa a maior parte da largura da tela (com
        // uma "espiada" da próxima coluna) para o conteúdo do card não
        // ficar espremido; a partir de `sm` volta para a largura fixa de
        // desktop. `snap-start` funciona com o `snap-x` do board (scroll
        // horizontal "prende" em cada coluna, comum em Kanban mobile).
        "flex w-[85vw] shrink-0 snap-start flex-col rounded-lg transition-colors sm:w-[302px]",
        // A coluna não tem moldura própria: o que a delimita é o espaço e o
        // fundo do quadro. Só ao arrastar sobre ela é que ganha contorno.
        isOver && "bg-primary/[0.06] ring-2 ring-primary/40",
      )}
    >
      {/* Barra colorida da fase acima do cabeçalho, como na referência:
          separa as colunas de relance, mesmo quando várias têm nomes
          longos e parecidos. */}
      <div className={cn("mx-1 h-0.5 shrink-0 rounded-full", color.bar)} aria-hidden />

      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg bg-board/95 px-1 py-2 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Etiqueta com o nome da fase na própria cor — é o que dá a
              leitura colorida do quadro de relance. */}
          <span
            className={cn(
              "truncate rounded-md px-2 py-1 text-ui-sm font-semibold",
              color.soft,
              color.text,
            )}
          >
            {phase.name}
          </span>
          <span className="tabular shrink-0 text-ui-sm font-semibold text-muted-foreground">
            {cards.length}
          </span>
          {phase.isFinal ? (
            <Tooltip content="Fase final do processo">
              <Flag className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </Tooltip>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {breachedCount > 0 ? (
            <Tooltip content={`${breachedCount} atividade(s) com prazo da fase excedido`}>
              <span className="tabular flex items-center gap-0.5 rounded bg-destructive/12 px-1.5 py-0.5 text-ui-2xs font-semibold text-destructive">
                <AlarmClock className="size-3" aria-hidden />
                {breachedCount}
              </span>
            </Tooltip>
          ) : null}
          {canManagePhases ? (
            <PhaseColorPicker phaseId={phase.id} pipeId={pipeId} currentColor={phase.color} />
          ) : null}
        </div>
      </div>

      {phase.slaHours ? (
        <p className="shrink-0 px-1 pb-1.5 text-ui-2xs text-muted-foreground">
          Prazo da fase: {phase.slaHours}h
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 px-1 pb-2" style={{ minHeight: 80 }}>
        {cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-ui-xs text-muted-foreground">
            Nenhuma atividade
          </p>
        ) : (
          cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              pipeId={pipeId}
              labelsById={labelsById}
              phase={phase}
              phases={phases}
              currentUserId={currentUserId}
              onActionError={onActionError}
            />
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  UserPlus,
} from "lucide-react";

import { DeleteCardDialog } from "@/components/cards/delete-card-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPhaseColor } from "@/lib/phase-colors";
import { cn } from "@/lib/utils";
import { archiveCard, assignUser, moveCard } from "@/server/actions/cards";
import type { PhaseSummary } from "@/server/queries/pipes";

/**
 * Ações rápidas do card, direto no quadro.
 *
 * Liga actions que existiam e eram testadas, mas que nenhuma tela chamava:
 * `archiveCard` e `assignUser`. Mover de fase pelo menu complementa o
 * arrastar e soltar — útil em telas pequenas e para quem usa teclado.
 */
export function CardActionsMenu({
  cardId,
  pipeId,
  cardNumber,
  cardTitle,
  currentPhaseId,
  phases,
  currentUserId,
  isAssignedToMe,
  canDelete = false,
  onError,
}: {
  cardId: string;
  pipeId: string;
  cardNumber: number;
  cardTitle: string;
  currentPhaseId: string;
  phases: PhaseSummary[];
  currentUserId: string | null;
  isAssignedToMe: boolean;
  /** Só admin/super_admin exclui — a policy decide, isto é a dica visual. */
  canDelete?: boolean;
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function report(message: string) {
    if (onError) onError(message);
  }

  async function handleMove(targetPhaseId: string) {
    setPending(true);
    const result = await moveCard({ cardId, pipeId, targetPhaseId });
    setPending(false);

    if (!result.success) {
      // Campo obrigatório em falta é o caso mais comum aqui — a mensagem do
      // servidor diz qual, e precisa chegar ao usuário.
      report(result.error ?? "Não foi possível mover o card.");
      return;
    }
    router.refresh();
  }

  async function handleAssignToMe() {
    if (!currentUserId) return;
    setPending(true);
    const result = await assignUser({ cardId, pipeId, userId: currentUserId });
    setPending(false);

    if (!result.success) {
      report(result.error ?? "Não foi possível atribuir o card.");
      return;
    }
    router.refresh();
  }

  async function handleArchive() {
    setPending(true);
    const result = await archiveCard({ cardId, pipeId, isArchived: true });
    setPending(false);

    if (!result.success) {
      report(result.error ?? "Não foi possível arquivar o card.");
      return;
    }
    router.refresh();
  }

  const otherPhases = phases.filter((p) => p.id !== currentPhaseId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        // `stopPropagation` impede que o clique inicie um arraste do card.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50",
          pending && "opacity-100",
        )}
        title="Ações do card"
        aria-label="Ações do card"
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/pipes/${pipeId}/cards/${cardId}`}>
            <ExternalLink className="size-3.5" aria-hidden />
            Abrir card
          </Link>
        </DropdownMenuItem>

        {currentUserId && !isAssignedToMe ? (
          <DropdownMenuItem onSelect={() => void handleAssignToMe()}>
            <UserPlus className="size-3.5" aria-hidden />
            Atribuir a mim
          </DropdownMenuItem>
        ) : null}

        {otherPhases.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRight className="size-3.5" aria-hidden />
              Mover para
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel>Fases</DropdownMenuLabel>
              {otherPhases.map((phase) => {
                const color = getPhaseColor(phase.color);
                return (
                  <DropdownMenuItem
                    key={phase.id}
                    onSelect={() => void handleMove(phase.id)}
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", color.bar)} aria-hidden />
                    {phase.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => void handleArchive()}>
          <Archive className="size-3.5" aria-hidden />
          Arquivar
        </DropdownMenuItem>

        {canDelete ? (
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" aria-hidden />
            Excluir
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>

      <DeleteCardDialog
        cardId={cardId}
        pipeId={pipeId}
        cardNumber={cardNumber}
        cardTitle={cardTitle}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </DropdownMenu>
  );
}

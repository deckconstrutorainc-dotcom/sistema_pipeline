"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveCard } from "@/server/actions/cards";

interface PhaseOption {
  id: string;
  name: string;
}

interface MovePhasePanelProps {
  cardId: string;
  pipeId: string;
  currentPhaseId: string;
  phases: PhaseOption[];
}

/**
 * Painel de "Mover para fase": lista as fases de destino possíveis (todas
 * exceto a atual) como botões de ação, chamando a mesma RPC `move_card`
 * usada em qualquer outro fluxo de movimentação (Kanban) — toda a
 * validação (autorização, campo obrigatório, etc.) continua acontecendo no
 * servidor dentro de `move_card()` (CLAUDE.md §10); esta UI só exibe o
 * erro retornado, sem duplicar a lógica.
 */
export function MovePhasePanel({ cardId, pipeId, currentPhaseId, phases }: MovePhasePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingPhaseId, setPendingPhaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPhase = phases.find((phase) => phase.id === currentPhaseId);
  const destinationPhases = phases.filter((phase) => phase.id !== currentPhaseId);

  const handleMove = (targetPhaseId: string) => {
    setError(null);
    setPendingPhaseId(targetPhaseId);

    startTransition(async () => {
      const result = await moveCard({ cardId, pipeId, targetPhaseId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível mover o card.");
        setPendingPhaseId(null);
        return;
      }
      router.refresh();
      setPendingPhaseId(null);
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Fase atual: <span className="font-medium text-foreground">{currentPhase?.name ?? "—"}</span>
      </p>
      {destinationPhases.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há outra fase para mover este card.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {destinationPhases.map((phase) => (
            <Button
              key={phase.id}
              type="button"
              variant="outline"
              size="sm"
              className={cn("justify-between font-normal")}
              disabled={isPending}
              onClick={() => handleMove(phase.id)}
            >
              <span>{phase.name}</span>
              {isPending && pendingPhaseId === phase.id ? (
                <span className="text-xs text-muted-foreground">Movendo...</span>
              ) : (
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          ))}
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

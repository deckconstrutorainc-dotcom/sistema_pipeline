"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { moveCard } from "@/server/actions/cards";

interface PhaseOption {
  id: string;
  name: string;
}

interface MoveCardSelectProps {
  cardId: string;
  pipeId: string;
  currentPhaseId: string;
  phases: PhaseOption[];
}

export function MoveCardSelect({ cardId, pipeId, currentPhaseId, phases }: MoveCardSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(currentPhaseId);

  const handleChange = (targetPhaseId: string) => {
    if (targetPhaseId === value) return;
    setError(null);
    const previous = value;
    setValue(targetPhaseId);

    startTransition(async () => {
      const result = await moveCard({ cardId, pipeId, targetPhaseId });
      if (!result.success) {
        setValue(previous);
        setError(result.error ?? "Não foi possível mover o card.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <select
        aria-label="Fase do card"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
        value={value}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
      >
        {phases.map((phase) => (
          <option key={phase.id} value={phase.id}>
            {phase.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

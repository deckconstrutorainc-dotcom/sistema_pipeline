"use client";

import { useState, useTransition } from "react";
import { Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { phaseColorPalette } from "@/lib/validation/phases";
import { updatePhaseColor } from "@/server/actions/phases";

interface PhaseColorPickerProps {
  phaseId: string;
  pipeId: string;
  currentColor: string | null;
}

/**
 * Seletor de cor da fase — paleta fixa de 8 cores (não um color picker
 * livre, CLAUDE.md §3.30/§30: não é réplica de UI de nenhuma ferramenta de
 * mercado, é um padrão funcional universal de Kanban). Usa `updatePhase`
 * via `updatePhaseColor` (server action já com checagem de
 * admin/super_admin da organização).
 */
export function PhaseColorPicker({ phaseId, pipeId, currentColor }: PhaseColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(currentColor);
  const [isPending, startTransition] = useTransition();

  function choose(next: string | null) {
    setColor(next);
    setOpen(false);
    startTransition(() => {
      void updatePhaseColor({ phaseId, pipeId, color: next });
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        title="Cor da fase"
        aria-label="Escolher cor da fase"
      >
        <Palette className="size-3.5" aria-hidden />
      </button>

      {open ? (
        <>
          {/* Overlay para fechar ao clicar fora, sem dependência de lib de UI extra. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-1 flex w-32 flex-wrap gap-1.5 rounded-md border bg-popover p-2 shadow-md">
            <button
              type="button"
              onClick={() => choose(null)}
              className={cn(
                "size-5 rounded-full border-2 border-dashed border-muted-foreground",
                color === null && "ring-2 ring-ring ring-offset-1",
              )}
              title="Sem cor"
              aria-label="Sem cor"
            />
            {phaseColorPalette.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => choose(hex)}
                className={cn("size-5 rounded-full", color === hex && "ring-2 ring-ring ring-offset-1")}
                style={{ backgroundColor: hex }}
                title={hex}
                aria-label={`Cor ${hex}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

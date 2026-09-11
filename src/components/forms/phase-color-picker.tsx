"use client";

import { useState, useTransition } from "react";
import { Check, Palette } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PHASE_COLORS } from "@/lib/phase-colors";
import { cn } from "@/lib/utils";
import { phaseColorPalette } from "@/lib/validation/phases";
import { updatePhaseColor } from "@/server/actions/phases";

interface PhaseColorPickerProps {
  phaseId: string;
  pipeId: string;
  currentColor: string | null;
}

/**
 * Seletor de cor da fase — paleta fixa (não um color picker livre,
 * CLAUDE.md §3.30/§30: não é réplica de UI de nenhuma ferramenta de
 * mercado, é um padrão funcional universal de Kanban). Usa `updatePhase`
 * via `updatePhaseColor` (server action já com checagem de
 * admin/super_admin da organização).
 *
 * O painel usa Popover (portal + detecção de colisão). A versão anterior
 * posicionava com `absolute top-full` e era cortada pelo `overflow` da
 * coluna do quadro — ver ADR-0004.
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={isPending}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        title="Cor da fase"
        aria-label="Escolher cor da fase"
      >
        <Palette className="size-3.5" aria-hidden />
      </PopoverTrigger>

      <PopoverContent className="w-auto p-2">
        <p className="mb-1.5 text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cor da fase
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          <button
            type="button"
            onClick={() => choose(null)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/60 transition-transform hover:scale-110",
              color === null && "ring-2 ring-ring ring-offset-1",
            )}
            title="Sem cor"
            aria-label="Sem cor"
          >
            {color === null ? <Check className="size-3 text-muted-foreground" aria-hidden /> : null}
          </button>

          {phaseColorPalette.map((hex) => {
            const name = PHASE_COLORS[hex]?.name ?? hex;
            const selected = color?.toUpperCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => choose(hex)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110",
                  selected && "ring-2 ring-ring ring-offset-1",
                )}
                style={{ backgroundColor: hex }}
                title={name}
                aria-label={`Cor ${name}`}
              >
                {selected ? <Check className="size-3 text-white" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

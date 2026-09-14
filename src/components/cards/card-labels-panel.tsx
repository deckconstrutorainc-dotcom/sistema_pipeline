"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getLabelStyle } from "@/lib/phase-colors";
import { addLabel, removeLabel } from "@/server/actions/cards";

interface Label {
  id: string;
  name: string;
  color: string;
}

/**
 * Etiquetas do card, com aplicar e remover.
 *
 * Mesma situação dos responsáveis: `addLabel`/`removeLabel` existiam e eram
 * testadas, sem nenhuma tela que as usasse.
 */
export function CardLabelsPanel({
  cardId,
  pipeId,
  labelIds,
  labels,
  readOnly = false,
}: {
  cardId: string;
  pipeId: string;
  labelIds: string[];
  labels: Label[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const labelById = new Map(labels.map((l) => [l.id, l]));
  const applied = labelIds
    .map((id) => labelById.get(id))
    .filter((l): l is Label => Boolean(l));

  async function toggle(labelId: string, isApplied: boolean) {
    setPendingId(labelId);
    setError(null);

    const result = isApplied
      ? await removeLabel({ cardId, pipeId, labelId })
      : await addLabel({ cardId, pipeId, labelId });

    setPendingId(null);

    if (!result.success) {
      setError(result.error ?? "Não foi possível atualizar a etiqueta.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      {applied.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">Nenhuma etiqueta.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {applied.map((label) => (
            <span
              key={label.id}
              className="group/label inline-flex items-center gap-1 rounded border px-1.5 py-px text-ui-xs font-medium"
              style={getLabelStyle(label.color)}
            >
              {label.name}
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => void toggle(label.id, true)}
                  disabled={pendingId === label.id}
                  className="opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30"
                  title={`Remover ${label.name}`}
                  aria-label={`Remover ${label.name}`}
                >
                  <X className="size-2.5" aria-hidden />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}

      {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}

      {!readOnly && labels.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              <Plus className="size-3" aria-hidden />
              Etiquetas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1">
            <ul className="max-h-64 overflow-y-auto">
              {labels.map((label) => {
                const isApplied = labelIds.includes(label.id);
                return (
                  <li key={label.id}>
                    <button
                      type="button"
                      onClick={() => void toggle(label.id, isApplied)}
                      disabled={pendingId === label.id}
                      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-ui-sm transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <span
                        className="size-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: label.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                      {isApplied ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

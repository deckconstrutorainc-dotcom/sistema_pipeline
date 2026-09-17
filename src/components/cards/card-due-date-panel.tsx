"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getDueStatus } from "@/lib/validation/cards";
import { updateCardFields } from "@/server/actions/cards";

/** ISO -> valor de `datetime-local` (o input não aceita fuso nem segundos). */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Prazo do card, editável.
 *
 * Antes era um `<p>` que aparecia apenas quando já havia prazo — não havia
 * como definir, alterar ou remover um prazo pela interface.
 */
export function CardDueDatePanel({
  cardId,
  pipeId,
  dueDate,
  readOnly = false,
}: {
  cardId: string;
  pipeId: string;
  dueDate: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => toLocalInputValue(dueDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = getDueStatus(dueDate);

  async function save(nextIso: string | null) {
    setSaving(true);
    setError(null);
    const result = await updateCardFields({ cardId, pipeId, dueDate: nextIso });
    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar o prazo.");
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  function submit() {
    if (!draft) {
      void save(null);
      return;
    }
    const parsed = new Date(draft);
    if (Number.isNaN(parsed.getTime())) {
      setError("Data inválida.");
      return;
    }
    void save(parsed.toISOString());
  }

  if (isEditing) {
    return (
      <div className="space-y-1.5">
        <Input
          type="datetime-local"
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(toLocalInputValue(dueDate));
              setError(null);
              setIsEditing(false);
            }
          }}
        />
        {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={submit} loading={saving}>
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setDraft(toLocalInputValue(dueDate));
              setError(null);
              setIsEditing(false);
            }}
          >
            Cancelar
          </Button>
          {dueDate ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              disabled={saving}
              onClick={() => void save(null)}
              title="Remover prazo"
            >
              <X className="size-3" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!dueDate) {
    return (
      <div className="space-y-1">
        {readOnly ? (
          <p className="text-ui-sm text-muted-foreground">Sem prazo.</p>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setIsEditing(true)}
          >
            <CalendarPlus className="size-3" aria-hidden />
            Definir prazo
          </Button>
        )}
        {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  const formatted = new Date(dueDate).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setIsEditing(true)}
        className={cn(
          "group/due flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-ui-sm transition-colors",
          !readOnly && "hover:bg-accent",
          status === "overdue" && "font-medium text-destructive",
          status === "due_soon" && "font-medium text-amber-700 dark:text-amber-400",
        )}
        title={readOnly ? undefined : "Editar prazo"}
      >
        <span className="min-w-0 flex-1 truncate">{formatted}</span>
        {!readOnly ? (
          <Pencil
            className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/due:opacity-100"
            aria-hidden
          />
        ) : null}
      </button>
      {status === "overdue" ? (
        <p className="text-ui-2xs text-destructive">Prazo vencido</p>
      ) : status === "due_soon" ? (
        <p className="text-ui-2xs text-amber-700 dark:text-amber-400">Vence em breve</p>
      ) : null}
      {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}
    </div>
  );
}

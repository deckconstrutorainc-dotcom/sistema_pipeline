"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";

import { FieldInput, isFieldEditable } from "@/components/forms/field-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateCardFields } from "@/server/actions/cards";
import type { FieldSummary } from "@/server/queries/pipes";

interface EditableFieldProps {
  cardId: string;
  pipeId: string;
  field: FieldSummary;
  value: unknown;
  /** Texto já formatado para leitura (moeda, data, etc.). */
  display: string;
  /** Somente leitura — sem permissão de escrita ou card arquivado. */
  readOnly?: boolean;
}

/**
 * Campo do card editável no lugar.
 *
 * Antes, os campos eram um `<dl>` puro: uma vez criado, o card não podia ser
 * corrigido por nenhuma tela. `updateCardFields` já existia e era testada,
 * mas nada a chamava.
 *
 * Segue o mesmo padrão do quadro (`board.tsx`): aplica o valor na hora e
 * desfaz se o servidor recusar — a RLS pode negar a escrita, e o erro
 * precisa aparecer, nunca sumir em silêncio.
 */
export function EditableField({
  cardId,
  pipeId,
  field,
  value,
  display,
  readOnly = false,
}: EditableFieldProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // O valor pode mudar por fora (refresh do servidor, automação) enquanto o
  // campo está fechado — nesse caso o rascunho acompanha.
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  const editable = !readOnly && isFieldEditable(field.type);

  function cancel() {
    setDraft(value);
    setError(null);
    setIsEditing(false);
  }

  async function save() {
    // Nada mudou: fecha sem tocar no servidor.
    if (JSON.stringify(draft) === JSON.stringify(value)) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateCardFields({
      cardId,
      pipeId,
      fieldValues: { [field.id]: draft },
    });

    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar.");
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    // Enter salva, menos em texto longo e multi-seleção, onde a tecla tem
    // significado próprio.
    if (event.key === "Enter" && field.type !== "long_text" && field.type !== "multi_select") {
      event.preventDefault();
      void save();
    }
  }

  if (!editable) {
    return (
      <div className="space-y-0.5">
        <dt className="text-ui-xs text-muted-foreground">{field.label}</dt>
        <dd className="text-ui-sm">{display || <span className="text-muted-foreground">—</span>}</dd>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div ref={containerRef} className="space-y-1 rounded-md bg-accent/40 p-1.5">
        <label htmlFor={`edit-${field.id}`} className="text-ui-xs font-medium text-muted-foreground">
          {field.label}
        </label>
        <FieldInput
          field={field}
          value={draft}
          onChange={setDraft}
          id={`edit-${field.id}`}
          autoFocus
          onKeyDown={handleKeyDown}
          disabled={saving}
        />
        {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => void save()} loading={saving}>
            {saving ? null : <Check className="size-3" aria-hidden />}
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            <X className="size-3" aria-hidden />
            Cancelar
          </Button>
          {field.type !== "long_text" && field.type !== "multi_select" ? (
            <span className="ml-auto text-ui-2xs text-muted-foreground">Enter salva · Esc cancela</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="group/field space-y-0.5">
      <dt className="text-ui-xs text-muted-foreground">{field.label}</dt>
      <dd>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-ui-sm transition-colors hover:bg-accent",
            !display && "text-muted-foreground",
          )}
          title={`Editar ${field.label}`}
        >
          <span className="min-w-0 flex-1 truncate">{display || "—"}</span>
          <Pencil
            className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/field:opacity-100"
            aria-hidden
          />
        </button>
      </dd>
    </div>
  );
}

/**
 * Título do card, editável no lugar.
 * Usa a mesma action, pelo parâmetro `title`.
 */
export function EditableTitle({
  cardId,
  pipeId,
  title,
  readOnly = false,
}: {
  cardId: string;
  pipeId: string;
  title: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) setDraft(title);
  }, [title, isEditing]);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("O título não pode ficar vazio.");
      return;
    }
    if (trimmed === title) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await updateCardFields({ cardId, pipeId, title: trimmed });
    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar o título.");
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  if (readOnly) {
    return <h1 className="text-ui-xl font-semibold tracking-tight">{title}</h1>;
  }

  if (isEditing) {
    return (
      <div className="space-y-1">
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- edição iniciada por clique do usuário
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(title);
              setError(null);
              setIsEditing(false);
            }
          }}
          className="w-full rounded-md border border-input bg-card px-2 py-1 text-ui-xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => void save()} loading={saving}>
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setDraft(title);
              setError(null);
              setIsEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="group/title flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent"
      title="Editar título"
    >
      <h1 className="text-ui-xl font-semibold tracking-tight">{title}</h1>
      <Pencil
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100"
        aria-hidden
      />
    </button>
  );
}

/** Indicador de salvamento para uso externo (barra lateral). */
export function SavingIndicator({ saving }: { saving: boolean }) {
  if (!saving) return null;
  return (
    <span className="flex items-center gap-1 text-ui-2xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" aria-hidden />
      Salvando…
    </span>
  );
}

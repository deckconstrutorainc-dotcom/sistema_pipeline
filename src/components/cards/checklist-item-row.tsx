"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteChecklistItem,
  toggleChecklistItem,
  updateChecklistItemTitle,
} from "@/server/actions/checklists";

interface ChecklistItemRowProps {
  itemId: string;
  cardId: string;
  pipeId: string;
  title: string;
  isDone: boolean;
}

export function ChecklistItemRow({ itemId, cardId, pipeId, title, isDone }: ChecklistItemRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleChecklistItem({ itemId, cardId, pipeId, isDone: !isDone });
      if (!result.success) {
        setError(result.error ?? "Não foi possível atualizar o item.");
        return;
      }
      router.refresh();
    });
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteChecklistItem({ itemId, cardId, pipeId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível remover o item.");
        return;
      }
      router.refresh();
    });
  };

  const handleSaveTitle = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === title) {
      setDraftTitle(title);
      setIsEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateChecklistItemTitle({ itemId, cardId, pipeId, title: trimmed });
      if (!result.success) {
        setError(result.error ?? "Não foi possível renomear o item.");
        setDraftTitle(title);
      }
      setIsEditing(false);
      router.refresh();
    });
  };

  return (
    <li className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={isDone}
        disabled={isPending}
        onChange={handleToggle}
        aria-label={isDone ? "Marcar item como pendente" : "Marcar item como concluído"}
      />
      {isEditing ? (
        <input
          autoFocus
          className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          value={draftTitle}
          disabled={isPending}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={handleSaveTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSaveTitle();
            }
            if (event.key === "Escape") {
              setDraftTitle(title);
              setIsEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={cn(
            "flex-1 text-left text-sm",
            isDone ? "text-muted-foreground line-through" : "text-foreground",
          )}
          onClick={() => setIsEditing(true)}
        >
          {title}
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100"
        disabled={isPending}
        onClick={handleDelete}
        aria-label="Remover item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

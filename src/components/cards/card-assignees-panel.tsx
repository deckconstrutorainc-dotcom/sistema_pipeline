"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { assignUser, unassignUser } from "@/server/actions/cards";

interface Member {
  id: string;
  fullName: string | null;
}

/**
 * Responsáveis do card, com atribuir e remover.
 *
 * Antes era uma `<ul>` de nomes: `assignUser`/`unassignUser` existiam e eram
 * testadas, mas nenhuma tela as chamava — depois de criado, o card não podia
 * receber nem perder responsável.
 */
export function CardAssigneesPanel({
  cardId,
  pipeId,
  assigneeIds,
  members,
  readOnly = false,
}: {
  cardId: string;
  pipeId: string;
  assigneeIds: string[];
  members: Member[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const available = members.filter((m) => !assigneeIds.includes(m.id));

  async function add(userId: string) {
    setPendingId(userId);
    setError(null);
    const result = await assignUser({ cardId, pipeId, userId });
    setPendingId(null);

    if (!result.success) {
      setError(result.error ?? "Não foi possível atribuir.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove(userId: string) {
    setPendingId(userId);
    setError(null);
    const result = await unassignUser({ cardId, pipeId, userId });
    setPendingId(null);

    if (!result.success) {
      setError(result.error ?? "Não foi possível remover.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      {assigneeIds.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">Nenhum responsável.</p>
      ) : (
        <ul className="space-y-1">
          {assigneeIds.map((id) => {
            const member = memberById.get(id);
            const name = member?.fullName ?? "Usuário removido";
            return (
              <li key={id} className="group/assignee flex items-center gap-1.5">
                <Avatar name={name} seed={id} size="sm" />
                <span className="min-w-0 flex-1 truncate text-ui-sm">{name}</span>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => void remove(id)}
                    disabled={pendingId === id}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover/assignee:opacity-100 disabled:opacity-50"
                    title={`Remover ${name}`}
                    aria-label={`Remover ${name}`}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}

      {!readOnly && available.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              <Plus className="size-3" aria-hidden />
              Adicionar responsável
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1">
            <ul className="max-h-64 overflow-y-auto">
              {available.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => void add(member.id)}
                    disabled={pendingId === member.id}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-ui-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Avatar name={member.fullName} seed={member.id} size="sm" />
                    <span className="min-w-0 flex-1 truncate">
                      {member.fullName ?? "Sem nome"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

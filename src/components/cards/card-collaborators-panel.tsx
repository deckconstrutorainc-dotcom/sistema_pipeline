"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandHelping, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { inviteCollaborator, removeCollaborator } from "@/server/actions/collaborators";
import type { CardCollaborator } from "@/server/queries/collaborators";

interface Member {
  id: string;
  fullName: string | null;
}

/**
 * Convida alguém de outro setor a ajudar nesta atividade.
 *
 * Com os processos restritos por setor, quem é de fora não enxerga o card.
 * O convite abre acesso só a ESTA atividade — não ao processo inteiro — e
 * a pessoa recebe uma notificação com o pedido.
 */
export function CardCollaboratorsPanel({
  cardId,
  pipeId,
  collaborators,
  members,
  readOnly = false,
}: {
  cardId: string;
  pipeId: string;
  collaborators: CardCollaborator[];
  /** Membros da organização que ainda não são responsáveis nem convidados. */
  members: Member[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [request, setRequest] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invitedIds = new Set(collaborators.map((c) => c.userId));
  const available = members.filter((m) => !invitedIds.has(m.id));

  function reset() {
    setSelected(null);
    setRequest("");
    setError(null);
  }

  async function submit() {
    if (!selected) return;
    setPending(true);
    setError(null);

    const result = await inviteCollaborator({
      cardId,
      pipeId,
      userId: selected.id,
      request: request.trim() || undefined,
    });
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível convidar.");
      return;
    }

    setOpen(false);
    reset();
    router.refresh();
  }

  async function remove(collaboratorId: string) {
    setPending(true);
    setError(null);
    const result = await removeCollaborator({ collaboratorId, cardId, pipeId });
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível remover.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      {collaborators.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">Ninguém convidado.</p>
      ) : (
        <ul className="space-y-1">
          {collaborators.map((person) => (
            <li key={person.id} className="group/collab flex items-start gap-1.5">
              <Avatar name={person.fullName} seed={person.userId} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui-sm">{person.fullName ?? "Sem nome"}</p>
                {person.request ? (
                  <p className="text-ui-2xs text-muted-foreground">{person.request}</p>
                ) : null}
              </div>
              {!readOnly ? (
                <Tooltip content="Remover convite">
                  <button
                    type="button"
                    onClick={() => void remove(person.id)}
                    disabled={pending}
                    className="mt-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover/collab:opacity-100 disabled:opacity-50"
                    aria-label={`Remover ${person.fullName ?? "convidado"}`}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Tooltip>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="text-ui-xs text-destructive">{error}</p> : null}

      {!readOnly && available.length > 0 ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) reset();
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              <HandHelping className="size-3" aria-hidden />
              Pedir ajuda de outro setor
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-72 p-2">
            {selected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Avatar name={selected.fullName} seed={selected.id} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-ui-sm font-medium">
                    {selected.fullName ?? "Sem nome"}
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Escolher outra pessoa"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>

                <div className="space-y-1">
                  <label htmlFor="collab-request" className="text-ui-xs text-muted-foreground">
                    O que você precisa? (opcional)
                  </label>
                  <Input
                    id="collab-request"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- passo seguinte de um fluxo iniciado pelo usuário
                    autoFocus
                    value={request}
                    disabled={pending}
                    placeholder="Ex.: cotação de esquadrias até sexta"
                    onChange={(event) => setRequest(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                  />
                </div>

                <p className="text-ui-2xs text-muted-foreground">
                  A pessoa passa a ver <strong>somente esta atividade</strong> e recebe uma
                  notificação.
                </p>

                <Button size="sm" className="w-full" onClick={() => void submit()} loading={pending}>
                  Convidar
                </Button>
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {available.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(member)}
                      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-ui-sm transition-colors hover:bg-accent"
                    >
                      <Avatar name={member.fullName} seed={member.id} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {member.fullName ?? "Sem nome"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

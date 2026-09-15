"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCard } from "@/server/actions/cards";

/**
 * Confirmação de exclusão permanente.
 *
 * Pede o número do card digitado, não um "tem certeza?". A diferença
 * importa: a caixa de confirmação comum vira reflexo depois da terceira
 * vez, enquanto digitar o número obriga a olhar QUAL card está prestes a
 * sumir.
 *
 * Quem exclui precisa ser admin — a policy decide, esta tela só informa.
 */
export function DeleteCardDialog({
  cardId,
  pipeId,
  cardNumber,
  cardTitle,
  open,
  onOpenChange,
}: {
  cardId: string;
  pipeId: string;
  cardNumber: number;
  cardTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().replace(/^#/, "") === String(cardNumber);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function handleDelete() {
    if (!matches) return;
    setPending(true);
    setError(null);

    const result = await deleteCard({ cardId, pipeId, confirmNumber: cardNumber });
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível excluir.");
      return;
    }

    handleOpenChange(false);
    // Volta ao quadro: a página do card deixou de existir.
    router.push(`/pipes/${pipeId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onClose={() => handleOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Excluir atividade</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div className="space-y-1 text-ui-sm">
              <p className="font-medium">Esta ação não pode ser desfeita.</p>
              <p className="text-muted-foreground">
                Serão apagados junto: conversa, checklist, anexos, histórico e os vínculos com
                atividades de outros setores.
              </p>
            </div>
          </div>

          <p className="text-ui-sm text-muted-foreground">
            Se a intenção é apenas tirar do quadro,{" "}
            <strong className="font-medium text-foreground">arquivar</strong> preserva tudo isso.
          </p>

          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="tabular text-ui-2xs text-muted-foreground">#{cardNumber}</p>
            <p className="truncate text-ui-sm font-medium">{cardTitle}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirm-number">
              Digite <strong className="tabular">{cardNumber}</strong> para confirmar
            </Label>
            <Input
              id="confirm-number"
              value={typed}
              disabled={pending}
              placeholder={String(cardNumber)}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches) {
                  event.preventDefault();
                  void handleDelete();
                }
              }}
            />
          </div>

          {error ? <p className="text-ui-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={!matches}
            loading={pending}
          >
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

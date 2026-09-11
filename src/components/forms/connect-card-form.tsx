"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectCardToCard } from "@/server/actions/connections";

interface ConnectCardFormProps {
  cardId: string;
  pipeId: string;
}

/**
 * Conexão card <-> card por ID informado manualmente. Limitação
 * documentada (escopo do M4): não há um seletor de busca de cards entre
 * pipes nesta primeira versão — o usuário copia o UUID do card de destino
 * a partir da URL compartilhável do card (CLAUDE.md §12: "URL do card deve
 * ser compartilhável"). Autorização cross-tenant/cross-pipe continua
 * validada no servidor (`can_connect_cards`) independentemente do que for
 * digitado aqui.
 */
export function ConnectCardForm({ cardId, pipeId }: ConnectCardFormProps) {
  const router = useRouter();
  const [otherCardId, setOtherCardId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    setIsSubmitting(true);
    const result = await connectCardToCard({ cardId, pipeId, otherCardId });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível conectar os cards.");
      return;
    }
    setOtherCardId("");
    router.refresh();
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium text-muted-foreground">Conectar a outro card (ID do card)</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 max-w-xs"
          placeholder="UUID do card"
          value={otherCardId}
          onChange={(event) => setOtherCardId(event.target.value)}
        />
        <Button type="button" size="sm" disabled={isSubmitting || !otherCardId} onClick={handleConnect}>
          {isSubmitting ? "Conectando..." : "Conectar"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

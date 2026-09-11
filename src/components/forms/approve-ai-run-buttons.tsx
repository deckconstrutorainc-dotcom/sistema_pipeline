"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { approveAiRun } from "@/server/actions/ai-runs";

interface ApproveAiRunButtonsProps {
  runId: string;
}

/**
 * Botões de aprovação/rejeição humana para uma `ai_run` em
 * `awaiting_approval` (CLAUDE.md §17/§3.29). Delega para a server action
 * `approveAiRun`, que por sua vez delega para a RPC `approve_ai_run` — este
 * componente nunca faz um UPDATE direto.
 */
export function ApproveAiRunButtons({ runId }: ApproveAiRunButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handle = (approve: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await approveAiRun({ runId, approve });
      if (!result.success) {
        setError(result.error ?? "Não foi possível processar a decisão.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => handle(true)}>
          Aprovar
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handle(false)}>
          Rejeitar
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

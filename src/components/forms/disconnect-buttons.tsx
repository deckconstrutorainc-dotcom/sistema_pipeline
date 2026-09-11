"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { disconnectCardFromCard, disconnectCardFromRecord } from "@/server/actions/connections";

export function DisconnectRecordButton({
  cardId,
  pipeId,
  recordId,
}: {
  cardId: string;
  pipeId: string;
  recordId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await disconnectCardFromRecord({ cardId, pipeId, recordId });
          router.refresh();
        })
      }
    >
      Desconectar
    </Button>
  );
}

export function DisconnectCardButton({
  cardId,
  pipeId,
  otherCardId,
}: {
  cardId: string;
  pipeId: string;
  otherCardId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await disconnectCardFromCard({ cardId, pipeId, otherCardId });
          router.refresh();
        })
      }
    >
      Desconectar
    </Button>
  );
}

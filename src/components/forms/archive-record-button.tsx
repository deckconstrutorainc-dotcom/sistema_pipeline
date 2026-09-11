"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { archiveRecord } from "@/server/actions/records";

interface ArchiveRecordButtonProps {
  recordId: string;
  databaseId: string;
  isArchived: boolean;
}

export function ArchiveRecordButton({ recordId, databaseId, isArchived }: ArchiveRecordButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await archiveRecord({ recordId, databaseId, isArchived: !isArchived });
      if (!result.success) {
        setError(result.error ?? "Não foi possível atualizar o registro.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1 text-right">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isArchived ? "Desarquivar" : "Arquivar"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

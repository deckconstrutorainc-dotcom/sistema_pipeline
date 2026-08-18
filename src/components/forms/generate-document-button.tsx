"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { generateDocument } from "@/server/actions/documents";

interface GenerateDocumentButtonProps {
  templateId: string;
  cardId: string;
}

export function GenerateDocumentButton({ templateId, cardId }: GenerateDocumentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateDocument({ templateId, cardId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível gerar o documento.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? "Gerando..." : "Gerar documento"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

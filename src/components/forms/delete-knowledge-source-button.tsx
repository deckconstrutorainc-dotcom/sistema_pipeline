"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteKnowledgeSource } from "@/server/actions/knowledge-sources";

interface DeleteKnowledgeSourceButtonProps {
  knowledgeSourceId: string;
  organizationId: string;
}

export function DeleteKnowledgeSourceButton({ knowledgeSourceId, organizationId }: DeleteKnowledgeSourceButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteKnowledgeSource({ knowledgeSourceId, organizationId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível remover.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleDelete}>
        {isPending ? "Removendo..." : "Remover"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

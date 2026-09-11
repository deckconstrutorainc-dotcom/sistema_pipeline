"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { publishInterface } from "@/server/actions/interfaces";

interface PublishInterfaceButtonProps {
  interfaceId: string;
  isPublished: boolean;
}

export function PublishInterfaceButton({ interfaceId, isPublished }: PublishInterfaceButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await publishInterface({ interfaceId, isPublished: !isPublished });
      if (!result.success) {
        setError(result.error ?? "Não foi possível atualizar a publicação.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? "Atualizando..." : isPublished ? "Despublicar" : "Publicar"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

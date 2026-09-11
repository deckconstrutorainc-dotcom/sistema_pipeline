"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toggleWebhook } from "@/server/actions/webhooks";

interface ToggleWebhookButtonProps {
  webhookId: string;
  organizationId: string;
  isActive: boolean;
}

export function ToggleWebhookButton({ webhookId, organizationId, isActive }: ToggleWebhookButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleWebhook({ webhookId, organizationId, isActive: !isActive });
      if (!result.success) {
        setError(result.error ?? "Não foi possível alterar o status.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={isActive ? "outline" : "default"}
        size="sm"
        disabled={isPending}
        onClick={handleToggle}
      >
        {isPending ? "Atualizando..." : isActive ? "Desativar" : "Ativar"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

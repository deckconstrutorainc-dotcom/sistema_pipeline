"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deactivateIntegration } from "@/server/actions/integrations";

interface DeactivateIntegrationButtonProps {
  integrationId: string;
  organizationId: string;
  isActive: boolean;
}

/** Desativa uma integração (nunca exclui — CLAUDE.md §22 preserva histórico). */
export function DeactivateIntegrationButton({
  integrationId,
  organizationId,
  isActive,
}: DeactivateIntegrationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isActive) {
    return <p className="text-xs text-muted-foreground">Integração desativada.</p>;
  }

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await deactivateIntegration({ integrationId, organizationId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível desativar a integração.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? "Desativando..." : "Desativar"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

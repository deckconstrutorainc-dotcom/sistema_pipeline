"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setDefaultDashboard } from "@/server/actions/dashboards";

interface SetDefaultDashboardButtonProps {
  organizationId: string;
  dashboardId: string;
  isDefault: boolean;
}

export function SetDefaultDashboardButton({
  organizationId,
  dashboardId,
  isDefault,
}: SetDefaultDashboardButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isDefault) {
    return <span className="text-xs font-medium text-muted-foreground">Padrão</span>;
  }

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultDashboard({ organizationId, dashboardId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível definir como padrão.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleClick}>
        {isPending ? "Atualizando..." : "Definir como padrão"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { removeWidget } from "@/server/actions/dashboards";

interface RemoveWidgetButtonProps {
  dashboardId: string;
  widgetId: string;
}

export function RemoveWidgetButton({ dashboardId, widgetId }: RemoveWidgetButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await removeWidget({ dashboardId, widgetId });
      if (result.success) {
        router.refresh();
      }
    });
  };

  return (
    <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={handleClick}>
      {isPending ? "Removendo..." : "Remover"}
    </Button>
  );
}

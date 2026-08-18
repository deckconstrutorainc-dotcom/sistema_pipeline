"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteReport } from "@/server/actions/reports";

export function DeleteReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteReport({ reportId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível excluir o report.");
        return;
      }
      router.push("/reports");
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={handleClick}>
        {isPending ? "Excluindo..." : "Excluir report"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

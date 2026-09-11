"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Algo deu errado
      </h1>
      <p className="max-w-md text-muted-foreground">
        Ocorreu um erro inesperado ao carregar esta página. Você pode tentar
        novamente ou voltar mais tarde.
      </p>
      <Button onClick={() => reset()}>Tentar novamente</Button>
    </main>
  );
}

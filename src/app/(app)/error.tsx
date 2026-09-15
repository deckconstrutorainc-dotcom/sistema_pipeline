"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";

/**
 * Captura erros de qualquer rota autenticada. Sem isto, uma falha de query
 * caía no error boundary da raiz e derrubava a navegação inteira — com a
 * sidebar junto.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Em produção a mensagem é omitida pelo Next; o `digest` é o que liga
    // esta tela à entrada correspondente no log do servidor.
    console.error("Erro na aplicação:", error);
  }, [error]);

  return (
    <ErrorState
      title="Não foi possível carregar esta página"
      description="O erro foi registrado. Tente novamente; se continuar, avise quem administra o sistema."
      detail={error.digest ? `Referência: ${error.digest}` : undefined}
      onRetry={reset}
    />
  );
}

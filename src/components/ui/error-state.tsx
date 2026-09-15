"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Erro de carregamento de uma rota ou seção.
 *
 * Mostra sempre uma saída (tentar de novo), e a mensagem técnica só quando
 * existe — nunca um "algo deu errado" sozinho, que não ajuda ninguém a
 * decidir o que fazer.
 */
export function ErrorState({
  title = "Não foi possível carregar",
  description,
  detail,
  onRetry,
  retryLabel = "Tentar novamente",
}: {
  title?: string;
  description?: string;
  /** Mensagem técnica; exibida em bloco monoespaçado quando presente. */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="text-ui-md font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-ui-sm text-muted-foreground">{description}</p>
      ) : null}
      {detail ? (
        <code className="max-w-md overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-ui-2xs text-muted-foreground">
          {detail}
        </code>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

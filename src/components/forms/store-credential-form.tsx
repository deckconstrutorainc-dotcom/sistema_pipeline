"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { storeCredential } from "@/server/actions/integrations";

interface StoreCredentialFormProps {
  integrationId: string;
  organizationId: string;
  hasCredential: boolean;
}

/**
 * Define/rotaciona o segredo (token/API key) de uma integração
 * (CLAUDE.md §3.10). O input é `type="password"` (nunca aparece em texto
 * na tela) e o formulário NUNCA recebe de volta o segredo digitado — só
 * `secretLastFour`, exibido como confirmação cosmética depois de salvar.
 */
export function StoreCredentialForm({ integrationId, organizationId, hasCredential }: StoreCredentialFormProps) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLastFour, setSavedLastFour] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedLastFour(null);

    if (!secret.trim()) {
      setError("Informe o segredo.");
      return;
    }

    setIsSubmitting(true);
    const result = await storeCredential({ integrationId, organizationId, secret });
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar a credencial.");
      return;
    }

    setSecret("");
    setSavedLastFour(result.secretLastFour ?? null);
    router.refresh();
  };

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label htmlFor={`secret-${integrationId}`} className="text-xs text-muted-foreground">
          {hasCredential ? "Rotacionar segredo" : "Definir segredo (token/API key)"}
        </label>
        <Input
          id={`secret-${integrationId}`}
          type="password"
          autoComplete="off"
          placeholder="••••••••"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-56"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : hasCredential ? "Rotacionar" : "Salvar"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {savedLastFour ? <p className="text-xs text-muted-foreground">Salvo: ****{savedLastFour}</p> : null}
    </form>
  );
}

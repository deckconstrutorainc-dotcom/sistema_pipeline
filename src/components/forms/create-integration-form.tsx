"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createIntegration } from "@/server/actions/integrations";
import { integrationProviders, type IntegrationProvider } from "@/lib/validation/integrations";

const providerLabels: Record<IntegrationProvider, string> = {
  http_webhook: "HTTP / Webhook genérico",
  email: "E-mail",
  google: "Google (stub — sem OAuth real)",
  microsoft: "Microsoft (stub — sem OAuth real)",
  e_signature: "Assinatura eletrônica (stub — sem OAuth real)",
};

interface CreateIntegrationFormProps {
  organizationId: string;
}

interface FormValues {
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  description?: string;
  configJson: string;
}

/**
 * Formulário de criação de integração (CLAUDE.md §13/§14). `config` é
 * digitado como JSON bruto (mesma decisão de UX já usada em
 * `create-automation-form.tsx` para parâmetros de ação — funcional > polish
 * neste milestone). Validação canônica roda no servidor via
 * `createIntegrationSchema` (`createIntegration`); aqui só uma checagem
 * mínima de campo obrigatório, sem duplicar o schema Zod completo.
 *
 * Nunca há campo de segredo aqui: o segredo é definido depois, na própria
 * linha da integração já criada (`StoreCredentialForm`) — deixa claro que
 * `config` (não-sensível) e credencial (sensível) são coisas diferentes.
 */
export function CreateIntegrationForm({ organizationId }: CreateIntegrationFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { organizationId, provider: "http_webhook", name: "", configJson: "{}" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);

    if (!values.name.trim()) {
      setFormError("Informe o nome da integração.");
      return;
    }

    let config: Record<string, unknown>;
    try {
      config = values.configJson.trim() ? (JSON.parse(values.configJson) as Record<string, unknown>) : {};
    } catch {
      setFormError("Configuração não é um JSON válido.");
      return;
    }

    const result = await createIntegration({
      organizationId: values.organizationId,
      provider: values.provider,
      name: values.name,
      description: values.description,
      config,
    });

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar a integração.");
      return;
    }

    reset({ organizationId, provider: "http_webhook", name: "", configJson: "{}" });
    router.refresh();
  };

  return (
    <form className="space-y-4 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="integration-name">Nome</Label>
          <Input id="integration-name" placeholder="Ex.: Notificações para o ERP" {...register("name")} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="integration-provider">Provider</Label>
          <select
            id="integration-provider"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            {...register("provider")}
          >
            {integrationProviders.map((provider) => (
              <option key={provider} value={provider}>
                {providerLabels[provider]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="integration-description">Descrição (opcional)</Label>
        <textarea
          id="integration-description"
          className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...register("description")}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="integration-config">Configuração (JSON, não-sensível — nunca coloque segredos aqui)</Label>
        <textarea
          id="integration-config"
          className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="{}"
          {...register("configJson")}
        />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar integração"}
      </Button>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

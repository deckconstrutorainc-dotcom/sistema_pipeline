import { CreateIntegrationForm } from "@/components/forms/create-integration-form";
import { DeactivateIntegrationButton } from "@/components/forms/deactivate-integration-button";
import { StoreCredentialForm } from "@/components/forms/store-credential-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listIntegrations } from "@/server/actions/integrations";

const providerLabels: Record<string, string> = {
  http_webhook: "HTTP / Webhook genérico",
  email: "E-mail",
  google: "Google (stub)",
  microsoft: "Microsoft (stub)",
  e_signature: "Assinatura eletrônica (stub)",
};

/**
 * Página de integrações (CLAUDE.md §16, M7). Estados: forbidden (não
 * admin), empty (nenhuma integração), success (lista) — loading é
 * implícito ao Server Component (streaming do App Router), error é
 * tratado retornando listas vazias nas actions (mesma postura já usada em
 * M2-M6, sem distinguir "vazio" de "erro de leitura" para não vazar
 * detalhe interno ao client).
 */
export default async function IntegrationsSettingsPage() {
  const organization = await requireActiveOrganization();
  const canManage = await hasOrgRole(organization.id, ["super_admin", "admin"]);

  if (!canManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">
          Você não tem permissão para gerenciar integrações desta organização.
        </p>
      </div>
    );
  }

  const integrations = await listIntegrations(organization.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">
          Conexões com serviços externos de <strong>{organization.name}</strong>. Segredos nunca são exibidos
          depois de salvos — apenas os últimos 4 caracteres, como confirmação.
        </p>
      </div>

      <CreateIntegrationForm organizationId={organization.id} />

      {integrations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma integração configurada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle>{integration.name}</CardTitle>
                  {integration.description ? (
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{providerLabels[integration.provider] ?? integration.provider}</Badge>
                    <Badge variant={integration.isActive ? "success" : "outline"}>
                      {integration.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                    <Badge variant={integration.hasCredential ? "success" : "warning"}>
                      {integration.hasCredential ? "Credencial configurada" : "Sem credencial"}
                    </Badge>
                  </div>
                </div>
                <DeactivateIntegrationButton
                  integrationId={integration.id}
                  organizationId={organization.id}
                  isActive={integration.isActive}
                />
              </CardHeader>
              <CardContent>
                <StoreCredentialForm
                  integrationId={integration.id}
                  organizationId={organization.id}
                  hasCredential={integration.hasCredential}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

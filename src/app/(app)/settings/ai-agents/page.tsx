import Link from "next/link";

import { CreateAiAgentForm } from "@/components/forms/create-ai-agent-form";
import { CreateKnowledgeSourceForm } from "@/components/forms/create-knowledge-source-form";
import { DeleteKnowledgeSourceButton } from "@/components/forms/delete-knowledge-source-button";
import { ToggleAiAgentButton } from "@/components/forms/toggle-ai-agent-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listAiAgents } from "@/server/actions/ai-agents";
import { listKnowledgeSources } from "@/server/actions/knowledge-sources";
import { listPipes } from "@/server/actions/pipes";

/** Página de agentes de IA (CLAUDE.md §17, M8). Estados: forbidden/empty/success. */
export default async function AiAgentsSettingsPage() {
  const organization = await requireActiveOrganization();
  const canManage = await hasOrgRole(organization.id, ["super_admin", "admin"]);

  if (!canManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Agentes de IA</h1>
        <p className="text-muted-foreground">Você não tem permissão para gerenciar agentes de IA desta organização.</p>
      </div>
    );
  }

  const [agents, knowledgeSources, pipes] = await Promise.all([
    listAiAgents(organization.id),
    listKnowledgeSources(organization.id),
    listPipes(),
  ]);

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agentes de IA</h1>
        <p className="text-muted-foreground">
          Cada agente só pode chamar as tools explicitamente autorizadas na allowlist — nunca acesso irrestrito ao
          banco (CLAUDE.md §17). Acompanhe as execuções em{" "}
          <Link href="/ai-runs" className="underline-offset-4 hover:underline">
            Execuções de IA
          </Link>
          .
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Novo agente</h2>
        <CreateAiAgentForm organizationId={organization.id} pipes={pipes.map((p) => ({ id: p.id, name: p.name }))} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Agentes configurados</h2>
        {agents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Nenhum agente de IA configurado ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle>{agent.name}</CardTitle>
                    {agent.description ? <p className="text-sm text-muted-foreground">{agent.description}</p> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={agent.isActive ? "success" : "outline"}>
                        {agent.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant={agent.requiresApproval ? "warning" : "secondary"}>
                        {agent.requiresApproval ? "Exige aprovação para tools críticas" : "Sem exigência de aprovação"}
                      </Badge>
                      {agent.pipeId ? <Badge variant="secondary">Escopo: pipe específico</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tools autorizadas: {agent.allowedTools.length > 0 ? agent.allowedTools.join(", ") : "nenhuma"}
                    </p>
                  </div>
                  <ToggleAiAgentButton agentId={agent.id} organizationId={organization.id} isActive={agent.isActive} />
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Base de conhecimento</h2>
        <p className="text-sm text-muted-foreground">
          Simplificação desta primeira versão: busca por texto simples (substring/palavra-chave), não busca
          semântica/vetorial.
        </p>
        <CreateKnowledgeSourceForm
          organizationId={organization.id}
          agents={agents.map((a) => ({ id: a.id, name: a.name }))}
        />
        {knowledgeSources.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Nenhuma fonte de conhecimento cadastrada ainda.
          </div>
        ) : (
          <ul className="space-y-2">
            {knowledgeSources.map((source) => (
              <li key={source.id} className="flex items-start justify-between rounded-md border p-3 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.sourceType}
                    {source.content ? ` · ${source.content.slice(0, 120)}${source.content.length > 120 ? "…" : ""}` : ""}
                  </p>
                </div>
                <DeleteKnowledgeSourceButton knowledgeSourceId={source.id} organizationId={organization.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

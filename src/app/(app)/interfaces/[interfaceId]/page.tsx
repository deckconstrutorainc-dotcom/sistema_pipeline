import Link from "next/link";

import { AddInterfaceComponentForm } from "@/components/forms/add-interface-component-form";
import { PublishInterfaceButton } from "@/components/forms/publish-interface-button";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listPipes } from "@/server/actions/pipes";
import { listDashboards } from "@/server/queries/dashboards";
import { listDatabases } from "@/server/queries/databases";
import { getInterfaceDetail, type InterfaceComponentSummary } from "@/server/queries/interfaces";

interface InterfacePageProps {
  params: Promise<{ interfaceId: string }>;
}

function ComponentBody({ component }: { component: InterfaceComponentSummary }) {
  switch (component.componentType) {
    case "text_block":
      return (
        <p className="whitespace-pre-wrap text-sm">
          {typeof component.config.text === "string" ? component.config.text : "(texto vazio)"}
        </p>
      );
    case "dashboard_embed":
      return typeof component.config.dashboardId === "string" ? (
        <Link
          href={`/dashboards/${component.config.dashboardId}`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Abrir dashboard
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">Dashboard não configurado.</p>
      );
    case "pipe_view":
      return typeof component.config.pipeId === "string" ? (
        <Link
          href={`/pipes/${component.config.pipeId}`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Abrir pipe
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">Pipe não configurado.</p>
      );
    case "database_view":
      return typeof component.config.databaseId === "string" ? (
        <Link
          href={`/databases/${component.config.databaseId}`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Abrir database
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">Database não configurado.</p>
      );
    default:
      return null;
  }
}

const componentTypeLabels: Record<InterfaceComponentSummary["componentType"], string> = {
  dashboard_embed: "Dashboard",
  pipe_view: "Pipe",
  database_view: "Database",
  text_block: "Texto",
};

export default async function InterfaceDetailPage({ params }: InterfacePageProps) {
  const { interfaceId } = await params;
  const organization = await requireActiveOrganization();

  const [detail, canManage] = await Promise.all([
    getInterfaceDetail(interfaceId),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  if (!detail) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Interface não encontrada</h1>
        <p className="text-muted-foreground">
          Esta interface não existe ou você não tem permissão para acessá-la.
        </p>
        <Link href="/interfaces" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Interfaces
        </Link>
      </div>
    );
  }

  // Membros não-admin não podem ver rascunhos (is_published = false) —
  // mesmo padrão de "não encontrado" usado para autorização negada, evitando
  // vazar a existência de uma interface ainda não publicada.
  if (!detail.interface.isPublished && !canManage) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Interface não disponível</h1>
        <p className="text-muted-foreground">
          Esta interface ainda não foi publicada por um administrador.
        </p>
        <Link href="/interfaces" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Interfaces
        </Link>
      </div>
    );
  }

  // Opções de referência para o formulário de composição só precisam ser
  // buscadas para quem pode gerenciar a interface (admin/super_admin).
  const [dashboards, pipes, databases] = canManage
    ? await Promise.all([
        listDashboards(organization.id),
        listPipes(),
        listDatabases(organization.id),
      ])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/interfaces" className="text-sm text-muted-foreground hover:underline">
            Interfaces
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.interface.name}</h1>
          {detail.interface.description ? (
            <p className="text-muted-foreground">{detail.interface.description}</p>
          ) : null}
        </div>
        {canManage ? (
          <PublishInterfaceButton
            interfaceId={detail.interface.id}
            isPublished={detail.interface.isPublished}
          />
        ) : null}
      </div>

      {detail.components.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum componente configurado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {detail.components.map((component) => (
            <div
              key={component.id}
              className="space-y-2 rounded-lg border p-4"
              style={{
                gridColumn: `span ${Math.min(component.width, 12)} / span ${Math.min(component.width, 12)}`,
              }}
            >
              <h2 className="text-xs font-medium uppercase text-muted-foreground">
                {componentTypeLabels[component.componentType]}
              </h2>
              <ComponentBody component={component} />
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Adicionar componente</h2>
          <AddInterfaceComponentForm
            interfaceId={detail.interface.id}
            dashboards={dashboards.map((d) => ({ id: d.id, name: d.name }))}
            pipes={pipes.map((p) => ({ id: p.id, name: p.name }))}
            databases={databases.map((d) => ({ id: d.id, name: d.name }))}
          />
          <p className="text-xs text-muted-foreground">
            Sem drag-and-drop nesta versão — a ordem segue posição vertical/horizontal informada (melhoria
            futura, mesmo nível de simplicidade já aceito para dashboards).
          </p>
        </div>
      ) : null}
    </div>
  );
}

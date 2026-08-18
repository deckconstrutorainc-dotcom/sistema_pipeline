import Link from "next/link";

import { ConfigurePortalItemsForm } from "@/components/forms/configure-portal-items-form";
import { CreatePortalForm } from "@/components/forms/create-portal-form";
import { TogglePortalButton } from "@/components/forms/toggle-portal-button";
import { Badge } from "@/components/ui/badge";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getPipeBoardData } from "@/server/queries/pipes";
import { getPortalItems, listPortalsForPipe } from "@/server/queries/portals";

interface PortalsPageProps {
  params: Promise<{ pipeId: string }>;
}

/**
 * Gestão de portais de um pipe: criar, ativar/desativar e configurar quais
 * campos aparecem no formulário público. Estados obrigatórios (CLAUDE.md
 * §12): loading é resolvido pelo streaming padrão do App Router
 * (`loading.tsx` raiz); aqui tratamos apenas empty/forbidden/success —
 * error é responsabilidade do `error.tsx` mais próximo.
 */
export default async function PortalsPage({ params }: PortalsPageProps) {
  const { pipeId } = await params;
  await requireActiveOrganization();

  const board = await getPipeBoardData(pipeId);
  if (!board) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pipe não encontrado</h1>
        <p className="text-muted-foreground">
          Este pipe não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href="/pipes" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Pipes
        </Link>
      </div>
    );
  }

  const portals = await listPortalsForPipe(pipeId);
  const activeFields = board.fields.filter((f) => !f.isArchived);

  const portalsWithItems = await Promise.all(
    portals.map(async (portal) => ({ portal, items: await getPortalItems(portal.id) })),
  );

  const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/pipes/${pipeId}`} className="text-sm text-muted-foreground hover:underline">
          {board.pipe.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Portais</h1>
        <p className="text-sm text-muted-foreground">
          Cada portal gera um link público de formulário que cria cards diretamente na fase inicial deste
          pipe.
        </p>
      </div>

      <CreatePortalForm pipeId={pipeId} />

      {portalsWithItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhum portal criado ainda para este pipe.
        </div>
      ) : (
        <ul className="space-y-4">
          {portalsWithItems.map(({ portal, items }) => (
            <li key={portal.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{portal.name}</h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    {publicOrigin}/portal/{portal.slug}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={portal.visibility === "restricted" ? "warning" : "secondary"}>
                    {portal.visibility === "restricted" ? "Restrito" : "Público"}
                  </Badge>
                  <Badge variant={portal.isActive ? "default" : "secondary"}>
                    {portal.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                  <TogglePortalButton portalId={portal.id} isActive={portal.isActive} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {portal.requestCount} solicitação(ões) recebida(s) · {portal.itemCount} campo(s) configurado(s)
              </p>

              <details>
                <summary className="cursor-pointer text-sm font-medium">Configurar campos do formulário</summary>
                <div className="mt-3">
                  <ConfigurePortalItemsForm
                    portalId={portal.id}
                    pipeId={pipeId}
                    pipeFields={activeFields.map((f) => ({ id: f.id, label: f.label, type: f.type }))}
                    initialItems={items}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

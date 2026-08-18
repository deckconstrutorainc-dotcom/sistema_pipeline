import Link from "next/link";

import { CreateCardForm } from "@/components/forms/create-card-form";
import { KanbanBoard } from "@/components/kanban/board";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getPipeBoardData } from "@/server/queries/pipes";

interface PipePageProps {
  params: Promise<{ pipeId: string }>;
}

export default async function PipeKanbanPage({ params }: PipePageProps) {
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{board.pipe.name}</h1>
          <div className="flex items-center gap-3">
            {board.pipe.isArchived ? (
              <span className="text-sm text-muted-foreground">(arquivado)</span>
            ) : null}
            <Link
              href={`/pipes/${board.pipe.id}/automations`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Automações
            </Link>
            <Link
              href={`/pipes/${board.pipe.id}/portals`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Portais
            </Link>
            <Link
              href={`/pipes/${board.pipe.id}/documents`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Documentos
            </Link>
          </div>
        </div>
        {board.pipe.description ? (
          <p className="text-muted-foreground">{board.pipe.description}</p>
        ) : null}
      </div>

      <CreateCardForm pipeId={board.pipe.id} />

      {board.phases.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Este pipe ainda não possui fases configuradas.
        </div>
      ) : (
        <KanbanBoard
          pipeId={board.pipe.id}
          phases={board.phases}
          initialCards={board.cards}
          labels={board.labels}
        />
      )}
    </div>
  );
}

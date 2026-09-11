import Link from "next/link";

import { CardsListTable } from "@/components/cards/cards-list-table";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getPipeBoardData } from "@/server/queries/pipes";

interface PipeListPageProps {
  params: Promise<{ pipeId: string }>;
}

/**
 * Aba "Lista" do pipe: visão em tabela de todos os cards, alternativa ao
 * Kanban para o mesmo conjunto de dados (`getPipeBoardData` — a mesma
 * query usada pela home do pipe, sem duplicar leitura do banco).
 */
export default async function PipeListPage({ params }: PipeListPageProps) {
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
        <h1 className="text-2xl font-semibold tracking-tight">Lista — {board.pipe.name}</h1>
        <p className="text-muted-foreground">Todos os cards deste pipe em formato de tabela.</p>
      </div>

      <CardsListTable
        pipeId={board.pipe.id}
        cards={board.cards}
        phases={board.phases}
        labels={board.labels}
      />
    </div>
  );
}

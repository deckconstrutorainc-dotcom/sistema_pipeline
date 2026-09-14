import Link from "next/link";
import { Columns3, SearchX } from "lucide-react";

import { CreateCardForm } from "@/components/forms/create-card-form";
import { KanbanBoard } from "@/components/kanban/board";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { hasOrgRole, requireActiveOrganization, requireAuth } from "@/lib/auth/session";
import { listOrganizationMembersForAssignment } from "@/server/queries/organizations";
import { getPipeBoardData } from "@/server/queries/pipes";

interface PipePageProps {
  params: Promise<{ pipeId: string }>;
}

export default async function PipeKanbanPage({ params }: PipePageProps) {
  const { pipeId } = await params;
  const organization = await requireActiveOrganization();
  // `requireAuth` é envolvida em React.cache() — não custa round-trip novo.
  const user = await requireAuth();

  const board = await getPipeBoardData(pipeId);

  if (!board) {
    return (
      <EmptyState
        icon={SearchX}
        title="Pipe não encontrado"
        description="Este pipe não existe ou você não tem permissão para acessá-lo."
        action={
          <Link href="/pipes" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Voltar para Pipes
          </Link>
        }
      />
    );
  }

  const canManagePhases = await hasOrgRole(organization.id, ["super_admin", "admin"]);
  const members = await listOrganizationMembersForAssignment(organization.id);

  const initialPhaseId = board.phases.find((p) => p.isInitial)?.id;
  const requiredFieldIds = board.phaseFields
    .filter((pf) => pf.phaseId === initialPhaseId && pf.isRequired)
    .map((pf) => pf.fieldId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-ui-xl font-semibold tracking-tight">{board.pipe.name}</h1>
            {board.pipe.isArchived ? <Badge variant="soft">Arquivado</Badge> : null}
          </div>
          <p className="text-ui-sm text-muted-foreground">
            {board.cards.length === 0
              ? "Nenhum card"
              : `${board.cards.length} card${board.cards.length > 1 ? "s" : ""} em ${board.phases.length} fase${board.phases.length > 1 ? "s" : ""}`}
            {board.pipe.description ? ` · ${board.pipe.description}` : ""}
          </p>
        </div>

        <CreateCardForm
          pipeId={board.pipe.id}
          fields={board.fields}
          requiredFieldIds={requiredFieldIds}
          members={members}
        />
      </div>

      {board.phases.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Este pipe ainda não tem fases"
          description={
            canManagePhases
              ? "As fases são as colunas do quadro — os passos pelos quais cada card caminha. Um processo simples costuma ter algo como: Solicitação, Análise, Aprovação e Concluído."
              : "Peça a um administrador da organização para configurar as fases deste processo."
          }
        />
      ) : (
        <KanbanBoard
          pipeId={board.pipe.id}
          phases={board.phases}
          initialCards={board.cards}
          labels={board.labels}
          canManagePhases={canManagePhases}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}

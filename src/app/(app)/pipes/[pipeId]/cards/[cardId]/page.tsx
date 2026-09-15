import Link from "next/link";

import { AddCommentForm } from "@/components/forms/add-comment-form";
import { SendEmailForm } from "@/components/forms/send-email-form";
import { GenerateDocumentButton } from "@/components/forms/generate-document-button";
import { TriggerAiRunForm } from "@/components/forms/trigger-ai-run-form";
import { CardAssigneesPanel } from "@/components/cards/card-assignees-panel";
import { CardChat } from "@/components/cards/card-chat";
import { CardCollaboratorsPanel } from "@/components/cards/card-collaborators-panel";
import { CardConnectionsSection } from "@/components/cards/card-connections-section";
import { CardDueDatePanel } from "@/components/cards/card-due-date-panel";
import { CardLabelsPanel } from "@/components/cards/card-labels-panel";
import { ChecklistSection } from "@/components/cards/checklist-section";
import { EditableField, EditableTitle } from "@/components/cards/editable-field";
import { MovePhasePanel } from "@/components/cards/move-phase-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireActiveOrganization, requireAuth } from "@/lib/auth/session";
import { getDueStatus } from "@/lib/validation/cards";
import { listAiAgents } from "@/server/actions/ai-agents";
import { listAiRunsForCard } from "@/server/actions/ai-runs";
import { getCardDetail, listChecklistItems } from "@/server/queries/cards";
import { listDocumentTemplatesForPipe, listGeneratedDocumentsForCard } from "@/server/queries/documents";
import { getEmailThreadsForCard } from "@/server/queries/email";
import { listCardCollaborators } from "@/server/queries/collaborators";
import { listOrganizationMembersForAssignment, listProfilesByIds } from "@/server/queries/organizations";
import { getPipeBoardData } from "@/server/queries/pipes";

const aiRunStatusLabels: Record<string, string> = {
  pending: "Pendente",
  running: "Executando",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  succeeded: "Concluída",
  failed: "Falhou",
};

interface CardPageProps {
  params: Promise<{ pipeId: string; cardId: string }>;
}

const activityLabels: Record<string, string> = {
  card_created: "Card criado",
  phase_changed: "Fase alterada",
  field_updated: "Campo atualizado",
  assigned: "Responsável atribuído",
  unassigned: "Responsável removido",
  label_added: "Label adicionada",
  label_removed: "Label removida",
  comment_added: "Comentário adicionado",
  attachment_added: "Anexo adicionado",
  card_archived: "Card arquivado",
  card_unarchived: "Card desarquivado",
  card_completed: "Card concluído",
  automation_action: "Ação de automação",
  record_connected: "Registro conectado",
  record_disconnected: "Registro desconectado",
  card_connected: "Card conectado",
  card_disconnected: "Card desconectado",
  autofill_applied: "Autofill aplicado",
  request_submitted: "Solicitação recebida via portal",
  email_sent: "E-mail enviado",
  document_generated: "Documento gerado",
  checklist_item_added: "Item de checklist adicionado",
  checklist_item_completed: "Item de checklist concluído",
};

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export default async function CardDetailPage({ params }: CardPageProps) {
  const { pipeId, cardId } = await params;
  const organization = await requireActiveOrganization();
  const user = await requireAuth();

  const [card, board] = await Promise.all([getCardDetail(cardId), getPipeBoardData(pipeId)]);
  const [emailThreads, documentTemplates, generatedDocuments, aiAgents, aiRuns, checklistItems, members, collaborators] =
    card
      ? await Promise.all([
          getEmailThreadsForCard(card.id),
          listDocumentTemplatesForPipe(organization.id, pipeId),
          listGeneratedDocumentsForCard(card.id),
          listAiAgents(organization.id),
          listAiRunsForCard(card.id),
          listChecklistItems(card.id),
          // Todos os membros atribuíveis, não apenas os já responsáveis: o
          // painel precisa da lista completa para oferecer quem adicionar.
          listOrganizationMembersForAssignment(organization.id),
          listCardCollaborators(card.id),
        ])
      : [[], [], [], [], [], [], [], []];

  const availableAiAgents = aiAgents.filter(
    (agent) => agent.isActive && (agent.pipeId === null || agent.pipeId === pipeId),
  );
  const checklistDone = checklistItems.filter((item) => item.isDone).length;

  if (!card || !board) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Card não encontrado</h1>
        <p className="text-muted-foreground">
          Este card não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href={`/pipes/${pipeId}`} className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para o pipe
        </Link>
      </div>
    );
  }

  // Nomes de quem aparece na tela: autores das mensagens, responsáveis e
  // convidados. Uma consulta só, em vez de uma por seção.
  const profiles = await listProfilesByIds([
    ...card.comments.map((c) => c.authorId),
    ...card.assigneeIds,
    ...collaborators.map((c) => c.userId),
  ]);
  const nameByUserId = new Map(profiles.map((p) => [p.id, p.fullName]));

  const dueStatus = getDueStatus(card.dueDate);

  // `FieldSummary` completo (com `options`), necessário para a edição inline.
  const activeFields = board.fields.filter((f) => !f.isArchived);

  // Forma reduzida exigida por `CardConnectionsSection`.
  const cardFields = activeFields.map((f) => ({
    fieldId: f.id,
    label: f.label,
    type: f.type,
  }));

  // Card arquivado ou concluído vira somente leitura. A permissão de escrita
  // em si é decidida pela RLS no servidor — aqui é só a dica visual; se a
  // política negar, a action devolve erro e a UI reverte.
  const canEditCard = !card.isArchived && !board.pipe.isArchived;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
        <div className="space-y-1">
          <Link href={`/pipes/${pipeId}`} className="text-sm text-muted-foreground hover:underline">
            {card.pipeName}
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="tabular shrink-0 text-ui-md font-medium text-muted-foreground">
              #{card.number}
            </span>
            <EditableTitle
              cardId={card.id}
              pipeId={pipeId}
              title={card.title}
              readOnly={!canEditCard}
            />
          </div>
          {dueStatus === "overdue" || dueStatus === "due_soon" ? (
            <Badge variant={dueStatus === "overdue" ? "destructive" : "warning"}>
              {dueStatus === "overdue" ? "Atrasado" : "Vence em breve"}
            </Badge>
          ) : null}
        </div>

        {/*
          Organização em abas (redesign do card, mantendo a mesma URL
          compartilhável de página cheia — CLAUDE.md §12 já aceita essa
          simplificação, adotar drawer/modal exigiria intercepting routes,
          fora do escopo desta etapa).

          Decisão de alocação: "Conexões (Data Hub, M4)" e "Assistente de
          IA (M8)" ficam dentro da aba Formulário — ambas lidam com
          preencher/enriquecer os dados do card (autofill a partir de um
          record conectado, extração via IA), então fazem mais sentido
          coexistindo com os campos do que em abas isoladas de baixo uso.
        */}
        <Tabs defaultValue="form">
          <TabsList>
            <TabsTrigger value="form">Formulário</TabsTrigger>
            <TabsTrigger value="activities">Atividades</TabsTrigger>
            <TabsTrigger value="attachments">Anexos</TabsTrigger>
            <TabsTrigger value="checklist">
              Checklist{checklistItems.length > 0 ? ` (${checklistDone}/${checklistItems.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="comments">Conversa</TabsTrigger>
            <TabsTrigger value="email">E-mail</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-ui-md font-semibold">Campos</h2>
              {activeFields.length === 0 ? (
                <p className="text-ui-sm text-muted-foreground">
                  Este pipe não possui campos configurados.
                </p>
              ) : (
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activeFields.map((field) => (
                    <EditableField
                      key={field.id}
                      cardId={card.id}
                      pipeId={pipeId}
                      field={field}
                      value={card.fieldValues[field.id]}
                      display={formatFieldValue(card.fieldValues[field.id])}
                      readOnly={!canEditCard}
                    />
                  ))}
                </dl>
              )}
            </section>

            <CardConnectionsSection
              cardId={card.id}
              pipeId={pipeId}
              organizationId={organization.id}
              cardFields={cardFields}
            />

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Assistente de IA</h2>
              <p className="text-xs text-muted-foreground">
                A IA só executa ações através de tools autorizadas na allowlist do agente — nunca acesso
                direto ao banco (CLAUDE.md §17). Ações críticas podem ficar retidas para aprovação humana
                em{" "}
                <Link href="/ai-runs" className="underline-offset-4 hover:underline">
                  Execuções de IA
                </Link>
                .
              </p>
              <TriggerAiRunForm
                cardId={card.id}
                agents={availableAiAgents.map((agent) => ({ id: agent.id, name: agent.name }))}
              />
              {aiRuns.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {aiRuns.map((run) => (
                    <li key={run.id}>
                      {new Date(run.createdAt).toLocaleString("pt-BR")} — {run.aiAgentName} —{" "}
                      {aiRunStatusLabels[run.status] ?? run.status}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="activities">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Histórico</h2>
              {card.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem atividade registrada.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {card.activities.map((activity) => (
                    <li key={activity.id} className="border-l-2 pl-2">
                      <p>{activityLabels[activity.type] ?? activity.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>

          <TabsContent value="attachments">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Anexos</h2>
              {card.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum anexo. Upload de arquivos depende de configuração do Supabase Storage (pendência
                  de infraestrutura).
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {card.attachments.map((attachment) => (
                    <li key={attachment.id}>{attachment.fileName}</li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>

          <TabsContent value="checklist">
            <ChecklistSection cardId={card.id} pipeId={pipeId} />
          </TabsContent>

          <TabsContent value="comments">
            <section className="space-y-3">
              <div className="space-y-0.5">
                <h2 className="text-ui-md font-semibold">Conversa</h2>
                <p className="text-ui-xs text-muted-foreground">
                  Histórico de mensagens desta atividade, visível a todos que participam dela.
                </p>
              </div>

              <CardChat
                messages={card.comments.map((comment) => ({
                  id: comment.id,
                  body: comment.body,
                  authorId: comment.authorId,
                  authorName: nameByUserId.get(comment.authorId) ?? null,
                  createdAt: comment.createdAt,
                }))}
                currentUserId={user.id}
              />

              <AddCommentForm cardId={card.id} pipeId={pipeId} />
            </section>
          </TabsContent>

          <TabsContent value="email">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">E-mail</h2>
              {emailThreads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma conversa de e-mail ainda para este card.
                </p>
              ) : (
                <ul className="space-y-3">
                  {emailThreads.map((thread) => (
                    <li key={thread.id} className="space-y-2 rounded-md border p-3">
                      <p className="text-sm font-medium">{thread.subject}</p>
                      <ul className="space-y-1">
                        {thread.messages.map((message) => (
                          <li key={message.id} className="rounded-md bg-muted/50 p-2 text-xs">
                            <p>
                              <span className="font-medium">
                                {message.direction === "outbound" ? "Enviado" : "Recebido"}
                              </span>{" "}
                              · {message.fromAddress} → {message.toAddresses.join(", ")} · {message.status}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <SendEmailForm cardId={card.id} defaultFromAddress="notificacoes@koryn-task.local" />
            </section>
          </TabsContent>

          <TabsContent value="documents">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Documentos</h2>
              {documentTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum template de documento disponível.{" "}
                  <Link href={`/pipes/${pipeId}/documents`} className="underline-offset-4 hover:underline">
                    Criar template
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2">
                  {documentTemplates.map((template) => (
                    <li
                      key={template.id}
                      className="flex items-center justify-between rounded-md border p-3 text-sm"
                    >
                      <span>{template.name}</span>
                      <GenerateDocumentButton templateId={template.id} cardId={card.id} />
                    </li>
                  ))}
                </ul>
              )}
              {generatedDocuments.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {generatedDocuments.map((doc) => (
                    <li key={doc.id}>
                      {new Date(doc.createdAt).toLocaleString("pt-BR")} —{" "}
                      {doc.status === "generated"
                        ? "gerado"
                        : doc.status === "failed"
                          ? `falhou (${doc.errorMessage ?? "erro desconhecido"})`
                          : "pendente"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </TabsContent>
        </Tabs>
      </div>

      {/* Em mobile, "Mover para fase" e o resumo do card aparecem primeiro
          (a ação mais provável ao abrir um card pelo celular); a partir de
          `lg` volta à ordem visual de sidebar à direita. */}
      <aside className="order-1 space-y-6 lg:order-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Mover para fase</h2>
          <MovePhasePanel
            cardId={card.id}
            pipeId={pipeId}
            currentPhaseId={card.currentPhaseId}
            phases={board.phases.map((p) => ({ id: p.id, name: p.name }))}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-ui-md font-semibold">Responsáveis</h2>
          <CardAssigneesPanel
            cardId={card.id}
            pipeId={pipeId}
            assigneeIds={card.assigneeIds}
            members={members}
            readOnly={!canEditCard}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-ui-md font-semibold">Etiquetas</h2>
          <CardLabelsPanel
            cardId={card.id}
            pipeId={pipeId}
            labelIds={card.labelIds}
            labels={board.labels}
            readOnly={!canEditCard}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-ui-md font-semibold">Ajuda de outro setor</h2>
          <CardCollaboratorsPanel
            cardId={card.id}
            pipeId={pipeId}
            collaborators={collaborators}
            members={members.filter((m) => !card.assigneeIds.includes(m.id))}
            readOnly={!canEditCard}
          />
        </section>

        {/* Sempre visível: sem isso não havia como DEFINIR um prazo, só ver
            um que já existisse. */}
        <section className="space-y-2">
          <h2 className="text-ui-md font-semibold">Prazo</h2>
          <CardDueDatePanel
            cardId={card.id}
            pipeId={pipeId}
            dueDate={card.dueDate}
            readOnly={!canEditCard}
          />
        </section>
      </aside>
    </div>
  );
}

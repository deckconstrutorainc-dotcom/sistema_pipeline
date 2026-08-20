import Link from "next/link";

import { AddCommentForm } from "@/components/forms/add-comment-form";
import { SendEmailForm } from "@/components/forms/send-email-form";
import { GenerateDocumentButton } from "@/components/forms/generate-document-button";
import { TriggerAiRunForm } from "@/components/forms/trigger-ai-run-form";
import { CardConnectionsSection } from "@/components/cards/card-connections-section";
import { ChecklistSection } from "@/components/cards/checklist-section";
import { MovePhasePanel } from "@/components/cards/move-phase-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getDueStatus } from "@/lib/validation/cards";
import { listAiAgents } from "@/server/actions/ai-agents";
import { listAiRunsForCard } from "@/server/actions/ai-runs";
import { getCardDetail, listChecklistItems } from "@/server/queries/cards";
import { listDocumentTemplatesForPipe, listGeneratedDocumentsForCard } from "@/server/queries/documents";
import { getEmailThreadsForCard } from "@/server/queries/email";
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

  const [card, board] = await Promise.all([getCardDetail(cardId), getPipeBoardData(pipeId)]);
  const [emailThreads, documentTemplates, generatedDocuments, aiAgents, aiRuns, checklistItems] = card
    ? await Promise.all([
        getEmailThreadsForCard(card.id),
        listDocumentTemplatesForPipe(organization.id, pipeId),
        listGeneratedDocumentsForCard(card.id),
        listAiAgents(organization.id),
        listAiRunsForCard(card.id),
        listChecklistItems(card.id),
      ])
    : [[], [], [], [], [], []];

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

  const dueStatus = getDueStatus(card.dueDate);
  const labelsById = new Map(board.labels.map((l) => [l.id, l]));
  const cardFields = board.fields.filter((f) => !f.isArchived).map((f) => ({
    fieldId: f.id,
    label: f.label,
    type: f.type,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
        <div className="space-y-1">
          <Link href={`/pipes/${pipeId}`} className="text-sm text-muted-foreground hover:underline">
            {card.pipeName}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            #{card.number} {card.title}
          </h1>
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
            <TabsTrigger value="comments">Comentários</TabsTrigger>
            <TabsTrigger value="email">E-mail</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Campos</h2>
              {board.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este pipe não possui campos configurados.</p>
              ) : (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {cardFields.map((field) => (
                    <div key={field.fieldId} className="space-y-0.5">
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="text-sm">{formatFieldValue(card.fieldValues[field.fieldId])}</dd>
                    </div>
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
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Comentários</h2>
              {card.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {card.comments.map((comment) => (
                    <li key={comment.id} className="rounded-md border p-3 text-sm">
                      <p>{comment.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
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
              <SendEmailForm cardId={card.id} defaultFromAddress="notificacoes@bts-pipe.local" />
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
          <h2 className="text-sm font-semibold">Responsáveis</h2>
          {card.assigneeIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum responsável atribuído.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {card.assigneeIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Labels</h2>
          {card.labelIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma label aplicada.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {card.labelIds.map((id) => {
                const label = labelsById.get(id);
                if (!label) return null;
                return (
                  <span
                    key={id}
                    className="rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                );
              })}
            </div>
          )}
        </section>

        {dueStatus !== "none" ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Prazo</h2>
            <p className="text-sm">
              {card.dueDate ? new Date(card.dueDate).toLocaleString("pt-BR") : "—"}
            </p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

"use client";

import { MessageSquare } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}

/**
 * Conversa do card.
 *
 * Antes os comentários eram uma lista de textos soltos, sem autor — numa
 * troca entre setores ninguém sabia quem tinha dito o quê.
 *
 * Aqui é um chat: mensagens do usuário logado alinhadas à direita, as dos
 * outros à esquerda com avatar e nome. Mensagens seguidas da mesma pessoa
 * são agrupadas, como em qualquer aplicativo de mensagem — repetir nome e
 * avatar a cada linha polui a leitura.
 */
export function CardChat({
  messages,
  currentUserId,
}: {
  messages: ChatMessage[];
  currentUserId: string;
}) {
  if (messages.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        size="sm"
        title="Nenhuma mensagem ainda"
        description="Use este espaço para alinhar a atividade com quem participa dela. Escreva @nome para chamar alguém."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {messages.map((message, index) => {
        const isMine = message.authorId === currentUserId;
        const previous = messages[index - 1];
        // Agrupa quando é a mesma pessoa dentro de 5 minutos.
        const groupedWithPrevious =
          previous?.authorId === message.authorId &&
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
            5 * 60_000;

        return (
          <li
            key={message.id}
            className={cn(
              "flex items-start gap-2",
              isMine && "flex-row-reverse",
              groupedWithPrevious && "mt-0.5",
            )}
          >
            {/* Espaço reservado quando agrupado: mantém o alinhamento sem
                repetir o avatar. */}
            <div className="w-7 shrink-0">
              {!groupedWithPrevious ? (
                <Avatar name={message.authorName} seed={message.authorId} size="sm" />
              ) : null}
            </div>

            <div className={cn("min-w-0 max-w-[80%] space-y-0.5", isMine && "items-end text-right")}>
              {!groupedWithPrevious ? (
                <div
                  className={cn(
                    "flex items-baseline gap-1.5 text-ui-2xs",
                    isMine && "flex-row-reverse",
                  )}
                >
                  <span className="font-medium text-foreground">
                    {isMine ? "Você" : (message.authorName ?? "Sem nome")}
                  </span>
                  <span className="text-muted-foreground">
                    {formatRelativeTime(message.createdAt)}
                  </span>
                </div>
              ) : null}

              <div
                className={cn(
                  "inline-block whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-left text-ui-sm",
                  isMine
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-foreground",
                )}
                title={new Date(message.createdAt).toLocaleString("pt-BR")}
              >
                <MessageBody body={message.body} highlight={!isMine} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Destaca as menções (@nome) dentro do texto.
 *
 * Puramente visual — quem é notificado de fato é decidido no banco, por
 * `resolve_mentions`. Aqui qualquer "@palavra" fica em destaque; marcar só
 * os nomes reais exigiria carregar a lista de pessoas em cada mensagem,
 * sem ganho proporcional.
 */
function MessageBody({ body, highlight }: { body: string; highlight: boolean }) {
  if (!highlight) return <>{body}</>;

  const parts = body.split(/(@[\p{L}][\p{L}\d._-]*)/gu);

  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("@") ? (
          <strong key={index} className="font-semibold text-primary">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

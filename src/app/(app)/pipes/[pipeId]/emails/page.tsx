import Link from "next/link";

import { requireActiveOrganization } from "@/lib/auth/session";
import { getPipeBoardData } from "@/server/queries/pipes";
import { listEmailThreadsForPipe } from "@/server/queries/email";

interface PipeEmailsPageProps {
  params: Promise<{ pipeId: string }>;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

/**
 * Aba "Emails" do pipe: lista agregada de todas as threads de e-mail dos
 * cards deste pipe (M5). Reaproveita `listEmailThreadsForPipe`
 * (src/server/queries/email.ts) em vez de duplicar a lógica de leitura de
 * `email_threads`/`email_messages` já usada na página de detalhe do card.
 */
export default async function PipeEmailsPage({ params }: PipeEmailsPageProps) {
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

  const threads = await listEmailThreadsForPipe(pipeId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Emails — {board.pipe.name}</h1>
        <p className="text-muted-foreground">
          Threads de e-mail de todos os cards deste pipe.
        </p>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma thread de e-mail registrada para os cards deste pipe ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Assunto</th>
                <th className="px-3 py-2 font-medium">Card</th>
                <th className="px-3 py-2 font-medium">Mensagens</th>
                <th className="px-3 py-2 font-medium">Última mensagem</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((thread) => (
                <tr key={thread.id} className="border-t">
                  <td className="px-3 py-2">{thread.subject}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/pipes/${pipeId}/cards/${thread.cardId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      #{thread.cardNumber} {thread.cardTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{thread.messageCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(thread.lastMessageAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

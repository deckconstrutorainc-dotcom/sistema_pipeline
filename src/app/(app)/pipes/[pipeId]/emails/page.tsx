import Link from "next/link";

import { requireActiveOrganization } from "@/lib/auth/session";
import { getPipeBoardData } from "@/server/queries/pipes";
import { listEmailThreadsForPipe } from "@/server/queries/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        <div className="rounded-lg border border-dashed bg-card/50 p-8 text-center text-ui-sm text-muted-foreground">
          Nenhuma thread de e-mail registrada para os cards deste pipe ainda.
        </div>
      ) : (
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Assunto</TableHead>
                <TableHead className="font-medium">Card</TableHead>
                <TableHead className="font-medium">Mensagens</TableHead>
                <TableHead className="font-medium">Última mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {threads.map((thread) => (
                <TableRow key={thread.id} className="border-t">
                  <TableCell>{thread.subject}</TableCell>
                  <TableCell>
                    <Link
                      href={`/pipes/${pipeId}/cards/${thread.cardId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      #{thread.cardNumber} {thread.cardTitle}
                    </Link>
                  </TableCell>
                  <TableCell>{thread.messageCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(thread.lastMessageAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      )}
    </div>
  );
}

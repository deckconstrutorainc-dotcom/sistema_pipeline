import Link from "next/link";

import { CreateDocumentTemplateForm } from "@/components/forms/create-document-template-form";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listDocumentTemplatesForPipe } from "@/server/queries/documents";
import { getPipeBoardData } from "@/server/queries/pipes";

interface DocumentsPageProps {
  params: Promise<{ pipeId: string }>;
}

export default async function PipeDocumentsPage({ params }: DocumentsPageProps) {
  const { pipeId } = await params;
  const organization = await requireActiveOrganization();

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

  const [templates, canManage] = await Promise.all([
    listDocumentTemplatesForPipe(organization.id, pipeId),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/pipes/${pipeId}`} className="text-sm text-muted-foreground hover:underline">
          {board.pipe.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Templates de documento</h1>
        <p className="text-muted-foreground">
          Gere documentos a partir de um card usando placeholders resolvidos a partir dos campos do pipe.
          Geração de PDF binário real é uma pendência de infraestrutura (ver detalhes no card gerado) — o
          conteúdo é renderizado como HTML/texto nesta fase.
        </p>
      </div>

      {canManage ? <CreateDocumentTemplateForm organizationId={organization.id} pipeId={pipeId} /> : null}

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum template de documento criado ainda.</p>
          {canManage ? (
            <p className="text-sm">Use o formulário acima para criar o primeiro template.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para criar um template.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => (
            <li key={template.id} className="space-y-1 rounded-lg border p-4">
              <p className="font-medium">{template.name}</p>
              {template.description ? (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {template.pipeId ? "Específico deste pipe" : "Template genérico da organização"}
              </p>
              <p className="text-xs text-muted-foreground">
                Para gerar um documento a partir deste template, abra um card do pipe e use a ação
                &quot;Gerar documento&quot; na seção de documentos do card.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

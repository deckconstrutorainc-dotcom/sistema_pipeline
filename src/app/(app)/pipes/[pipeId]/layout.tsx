import type { ReactNode } from "react";

import { PipeTabs } from "@/components/layout/pipe-tabs";
import { requireActiveOrganization } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

interface PipeLayoutProps {
  children: ReactNode;
  params: Promise<{ pipeId: string }>;
}

/**
 * Layout compartilhado de todas as sub-rotas de um pipe: adiciona a barra
 * de navegação por abas (Kanban/Lista/Relatórios/Formulário/Emails/
 * Painéis/Automações/Documentos) acima do conteúdo de cada aba.
 *
 * Se o pipe não existir ou o usuário não tiver acesso, não renderiza a
 * barra de abas — cada página filha já trata esse caso individualmente
 * (mesma postura de segurança de `getPipeBoardData`: RLS decide, sem
 * distinguir "não existe" de "sem permissão" na resposta observável).
 */
export default async function PipeLayout({ children, params }: PipeLayoutProps) {
  const { pipeId } = await params;
  await requireActiveOrganization();

  const supabase = await createClient();
  const { data: pipe } = await supabase
    .from("pipes")
    .select("id")
    .eq("id", pipeId)
    .maybeSingle<{ id: string }>();

  if (!pipe) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6">
      <PipeTabs pipeId={pipeId} />
      {children}
    </div>
  );
}

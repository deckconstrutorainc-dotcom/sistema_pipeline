"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface PipeTab {
  label: string;
  href: string;
  /** Só marca como ativa em correspondência exata (evita que "Kanban" — o
   * prefixo de todas as outras rotas do pipe — pareça sempre ativo). */
  exact?: boolean;
}

interface PipeTabsProps {
  pipeId: string;
}

/**
 * Barra de navegação por abas do pipe. Cada aba é uma rota real (Next.js
 * App Router) — nenhuma biblioteca de tabs nova, apenas `<Link>` + classes
 * condicionais (CLAUDE.md §13/§30: reaproveitar o que já existe, sem copiar
 * identidade visual de nenhuma ferramenta de mercado).
 *
 * "Painéis" aponta para `/dashboards`, que não é escopado por pipe no
 * schema atual (dashboards não têm `pipe_id`) — limitação documentada,
 * fora de escopo mudar isso agora. "Mapa" e "Fluxo" (diagrama do pipeline)
 * não foram implementados nesta rodada — possível próxima iteração.
 */
export function PipeTabs({ pipeId }: PipeTabsProps) {
  const pathname = usePathname();

  const tabs: PipeTab[] = [
    { label: "Kanban", href: `/pipes/${pipeId}`, exact: true },
    { label: "Lista", href: `/pipes/${pipeId}/list` },
    { label: "Relatórios", href: `/pipes/${pipeId}/reports` },
    { label: "Formulário", href: `/pipes/${pipeId}/portals` },
    { label: "Emails", href: `/pipes/${pipeId}/emails` },
    { label: "Painéis", href: `/dashboards` },
    { label: "Automações", href: `/pipes/${pipeId}/automations` },
    { label: "Documentos", href: `/pipes/${pipeId}/documents` },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Navegação do pipe">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              isActive && "border-primary text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

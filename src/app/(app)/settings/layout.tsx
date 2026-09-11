import Link from "next/link";

/**
 * Sub-navegação de Settings (CLAUDE.md §12 — "Sidebar esquerda persistente"
 * ainda pendente no layout raiz, ver TODO em `src/app/(app)/layout.tsx`;
 * aqui só uma nav secundária simples para as páginas de configuração,
 * mesmo espírito do topbar horizontal já usado no layout do app).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-4 border-b pb-3 text-sm text-muted-foreground">
        <Link href="/settings/members" className="hover:text-foreground">
          Membros
        </Link>
        <Link href="/settings/integrations" className="hover:text-foreground">
          Integrações
        </Link>
        <Link href="/settings/webhooks" className="hover:text-foreground">
          Webhooks
        </Link>
        <Link href="/settings/ai-agents" className="hover:text-foreground">
          Agentes de IA
        </Link>
      </nav>
      {children}
    </div>
  );
}

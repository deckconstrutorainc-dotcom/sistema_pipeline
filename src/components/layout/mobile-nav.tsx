"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export interface MobileNavItem {
  label: string;
  href: string;
}

interface MobileNavProps {
  items: MobileNavItem[];
}

/**
 * Menu de navegação principal para telas pequenas (< `md`). A barra
 * horizontal completa (`(app)/layout.tsx`) não cabe numa tela de celular
 * com todos os itens; aqui usamos um botão "hambúrguer" que revela um
 * painel com os mesmos links, sem depender de biblioteca de UI nova
 * (CLAUDE.md §2/§13) — apenas `useState` + Tailwind, como o resto do
 * projeto já faz (ver `Tabs` em `components/ui/tabs.tsx`).
 */
export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o menu automaticamente após navegar para uma nova rota.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Fechar menu de navegação" : "Abrir menu de navegação"}
        className="flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open ? (
        <nav
          id="mobile-nav-panel"
          aria-label="Navegação principal"
          className="absolute inset-x-0 top-full z-50 border-b bg-background px-4 py-2 shadow-lg"
        >
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

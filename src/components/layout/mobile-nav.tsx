"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { isNavItemActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  items: NavItem[];
}

/**
 * Navegação principal em telas pequenas (< `lg`), onde a sidebar não cabe.
 *
 * Botão "hambúrguer" que revela os mesmos itens da sidebar, com ícone e
 * indicação de rota ativa.
 */
export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o menu automaticamente após navegar para uma nova rota.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Fechar menu de navegação" : "Abrir menu de navegação"}
        className="flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 top-12 z-40 cursor-default bg-foreground/20"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-nav-panel"
            aria-label="Navegação principal"
            className="absolute inset-x-0 top-full z-50 max-h-[70vh] overflow-y-auto border-b bg-card px-2 py-2 shadow-lg"
          >
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isNavItemActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-md px-2 text-ui-md transition-colors",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      ) : null}
    </div>
  );
}

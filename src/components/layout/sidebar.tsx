"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  getNavIcon,
  isNavItemActive,
  navigationGroups,
  settingsNavItem,
  type NavItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "koryn:sidebar-collapsed";

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isNavItemActive(item, pathname);
  const Icon = getNavIcon(item.icon);

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-ui-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span>{item.label}</span>}
    </Link>
  );

  // Recolhida, só o ícone aparece — o tooltip é o que mantém a navegação
  // utilizável nesse estado.
  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right">
        {link}
      </Tooltip>
    );
  }
  return link;
}

/**
 * Navegação lateral persistente (CLAUDE.md §12).
 *
 * Substitui a barra horizontal de nove links de texto, que o próprio código
 * marcava como provisória.
 */
export function Sidebar({
  user,
  organizationName,
}: {
  user?: { email: string | null; id: string };
  organizationName?: string | null;
} = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // A preferência é lida depois da montagem para não divergir do HTML
  // renderizado no servidor (que não conhece o localStorage).
  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Janela anônima ou armazenamento bloqueado: segue expandida.
    }
  }, []);

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Preferência não persistida; não impede o uso.
      }
      return next;
    });
  }

  const isCollapsed = mounted && collapsed;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-150 lg:flex",
          isCollapsed ? "w-14" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center border-b px-3",
            isCollapsed && "justify-center px-0",
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            {isCollapsed ? (
              // Recolhida, só o símbolo K: a logo inteira não caberia em 56px.
              <Image
                src="/koryn-symbol.png"
                alt="Koryn Task"
                width={264}
                height={356}
                className="h-5 w-auto shrink-0"
              />
            ) : (
              <Image
                src="/koryn-logo.png"
                alt="Koryn Task"
                width={960}
                height={356}
                className="h-6 w-auto"
              />
            )}
          </Link>
        </div>

        <nav aria-label="Navegação principal" className="flex-1 space-y-3 overflow-y-auto p-2">
          {navigationGroups.map((group, index) => (
            <div key={group.title ?? `group-${index}`} className="space-y-0.5">
              {group.title && !isCollapsed ? (
                <p className="px-2 pb-0.5 text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
              ) : null}
              {group.title && isCollapsed ? <div className="mx-2 my-1.5 h-px bg-border" /> : null}
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={isCollapsed} />
              ))}
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-0.5 border-t p-2">
          <NavLink item={settingsNavItem} collapsed={isCollapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-ui-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
              isCollapsed && "justify-center px-0",
            )}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="size-4 shrink-0" aria-hidden />
                <span>Recolher</span>
              </>
            )}
          </button>
        </div>

        {/* Usuário no rodapé, como no modelo — identifica de quem é a sessão
            sem competir com a navegação. */}
        {user ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-t p-2.5",
              isCollapsed && "justify-center p-2",
            )}
          >
            <Avatar name={user.email} seed={user.id} size={isCollapsed ? "sm" : "md"} />
            {!isCollapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui-sm font-medium">{user.email}</p>
                {organizationName ? (
                  <p className="truncate text-ui-2xs text-muted-foreground">{organizationName}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </TooltipProvider>
  );
}

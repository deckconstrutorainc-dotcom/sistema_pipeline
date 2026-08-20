import Link from "next/link";

import { MobileNav } from "@/components/layout/mobile-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { Button } from "@/components/ui/button";
import { getActiveOrganization, listUserOrganizations, requireAuth } from "@/lib/auth/session";
import { signOut } from "@/server/actions/auth";

const mainNavItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pipes", href: "/pipes" },
  { label: "Databases", href: "/databases" },
  { label: "Tasks", href: "/tasks" },
  { label: "Reports", href: "/reports" },
  { label: "Dashboards", href: "/dashboards" },
  { label: "Interfaces", href: "/interfaces" },
  { label: "Execuções de IA", href: "/ai-runs" },
  { label: "Settings", href: "/settings/members" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  const organizations = await listUserOrganizations();
  const activeOrganization = await getActiveOrganization();

  return (
    <div className="flex min-h-screen flex-col">
      {/* TODO M7+: Sidebar esquerda persistente (layout final ainda como topbar horizontal). */}
      <header className="relative flex items-center justify-between gap-2 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-tight">BTS Pipe</span>
          {/* Barra horizontal completa: só cabe a partir de `md`. Em telas
              menores, os mesmos links ficam disponíveis via <MobileNav>. */}
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
            {mainNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {organizations.length > 1 && activeOrganization ? (
            <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganization.id} />
          ) : activeOrganization ? (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {activeOrganization.name}
            </span>
          ) : null}
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sair
            </Button>
          </form>
          <MobileNav items={mainNavItems} />
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

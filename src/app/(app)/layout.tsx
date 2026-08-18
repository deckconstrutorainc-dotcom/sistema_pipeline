import Link from "next/link";

import { OrgSwitcher } from "@/components/layout/org-switcher";
import { Button } from "@/components/ui/button";
import { getActiveOrganization, listUserOrganizations, requireAuth } from "@/lib/auth/session";
import { signOut } from "@/server/actions/auth";

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
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-tight">BTS Pipe</span>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/pipes" className="hover:text-foreground">
              Pipes
            </Link>
            <Link href="/databases" className="hover:text-foreground">
              Databases
            </Link>
            <Link href="/tasks" className="hover:text-foreground">
              Tasks
            </Link>
            <Link href="/reports" className="hover:text-foreground">
              Reports
            </Link>
            <Link href="/dashboards" className="hover:text-foreground">
              Dashboards
            </Link>
            <Link href="/interfaces" className="hover:text-foreground">
              Interfaces
            </Link>
            <Link href="/ai-runs" className="hover:text-foreground">
              Execuções de IA
            </Link>
            <Link href="/settings/members" className="hover:text-foreground">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {organizations.length > 1 && activeOrganization ? (
            <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganization.id} />
          ) : activeOrganization ? (
            <span className="text-sm text-muted-foreground">{activeOrganization.name}</span>
          ) : null}
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

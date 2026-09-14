import { MobileNav } from "@/components/layout/mobile-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { Sidebar } from "@/components/layout/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { flatNavigation } from "@/lib/navigation";
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
    <div className="flex min-h-screen">
      {/* Sidebar persistente a partir de `lg`; abaixo disso a navegação vive
          no menu compacto da topbar. */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav items={flatNavigation} />
            <span className="truncate text-ui-md font-semibold tracking-tight lg:hidden">
              Koryn Task
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {organizations.length > 1 && activeOrganization ? (
              <OrgSwitcher
                organizations={organizations}
                activeOrganizationId={activeOrganization.id}
              />
            ) : activeOrganization ? (
              <span className="hidden text-ui-sm text-muted-foreground sm:inline">
                {activeOrganization.name}
              </span>
            ) : null}

            <div className="flex items-center gap-1.5">
              <Avatar name={user.email ?? null} seed={user.id} size="sm" />
              <span className="hidden max-w-40 truncate text-ui-sm text-muted-foreground lg:inline">
                {user.email}
              </span>
            </div>

            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
}

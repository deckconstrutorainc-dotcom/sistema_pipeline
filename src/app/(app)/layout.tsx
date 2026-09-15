import Image from "next/image";

import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { Sidebar } from "@/components/layout/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { flatNavigation } from "@/lib/navigation";
import { getActiveOrganization, listUserOrganizations, requireAuth } from "@/lib/auth/session";
import { signOut } from "@/server/actions/auth";
import { countUnreadNotifications, listNotifications } from "@/server/queries/notifications";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  const [organizations, activeOrganization, notifications, unreadCount] = await Promise.all([
    listUserOrganizations(),
    getActiveOrganization(),
    listNotifications(8),
    countUnreadNotifications(),
  ]);

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        {/* Sidebar persistente a partir de `lg`; abaixo disso a navegação
            vive no menu compacto da topbar. */}
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <MobileNav items={flatNavigation} />
              <Image
                src="/koryn-logo.png"
                alt="Koryn Task"
                width={960}
                height={356}
                className="h-5 w-auto lg:hidden"
              />
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

              <NotificationsBell items={notifications} unreadCount={unreadCount} />

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
    </ToastProvider>
  );
}

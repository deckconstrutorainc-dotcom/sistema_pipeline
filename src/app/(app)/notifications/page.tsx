import { NotificationsList } from "@/components/notifications/notifications-list";
import { requireAuth } from "@/lib/auth/session";
import { listNotifications } from "@/server/queries/notifications";

export default async function NotificationsPage() {
  await requireAuth();
  const items = await listNotifications(100);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="space-y-0.5">
        <h1 className="text-ui-xl font-semibold tracking-tight">Notificações</h1>
        <p className="text-ui-sm text-muted-foreground">
          Atribuições, comentários, anexos, prazos e atividades relacionadas.
        </p>
      </div>

      <NotificationsList items={items} />
    </div>
  );
}

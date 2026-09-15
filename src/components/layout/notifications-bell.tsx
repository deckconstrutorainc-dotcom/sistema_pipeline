"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markAllNotificationsRead } from "@/server/actions/notifications";
import type { NotificationSummary } from "@/server/queries/notifications";

const REFRESH_MS = 60_000;

/**
 * Sino da topbar: contador de não lidas e as mais recentes num popover.
 *
 * Os dados chegam do servidor a cada navegação. Entre navegações, um
 * refresh a cada minuto (só com a aba visível) mantém o contador vivo sem
 * precisar de canal em tempo real — para uma equipe de seis pessoas isso é
 * suficiente, e é uma dependência a menos.
 */
export function NotificationsBell({
  items: initialItems,
  unreadCount: initialUnread,
}: {
  items: NotificationSummary[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // Props novas (após refresh) sobrescrevem o estado otimista local.
  useEffect(() => {
    setItems(initialItems);
    setUnread(initialUnread);
  }, [initialItems, initialUnread]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  function handleRead(id: string) {
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => (n.id === id ? { ...n, readAt: now } : n)));
    setUnread((current) => Math.max(0, current - 1));
    setOpen(false);
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    const now = new Date().toISOString();
    const previous = { items, unread };
    setItems((current) => current.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnread(0);

    const result = await markAllNotificationsRead();
    setMarkingAll(false);

    if (!result.success) {
      // Reverte: o usuário precisa ver que não deu certo, não achar que
      // limpou e depois receber tudo de volta.
      setItems(previous.items);
      setUnread(previous.unread);
      return;
    }
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notificações: ${unread} não lidas` : "Notificações"}
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-ui-sm font-semibold">Notificações</span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void handleMarkAll()}
              loading={markingAll}
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Marcar todas como lidas
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui-sm text-muted-foreground">
            Nenhuma notificação por aqui.
          </p>
        ) : (
          <ul className="max-h-[24rem] overflow-y-auto p-1">
            {items.slice(0, 8).map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} onRead={handleRead} compact />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t p-1">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded px-2 py-1.5 text-center text-ui-sm font-medium text-primary transition-colors hover:bg-accent"
          >
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

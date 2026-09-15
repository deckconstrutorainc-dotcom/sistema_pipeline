"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellOff, CheckCheck } from "lucide-react";

import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { markAllNotificationsRead } from "@/server/actions/notifications";
import type { NotificationSummary } from "@/server/queries/notifications";

export function NotificationsList({ items: initialItems }: { items: NotificationSummary[] }) {
  const router = useRouter();
  const { error: showError } = useToast();
  const [items, setItems] = useState(initialItems);
  const [markingAll, setMarkingAll] = useState(false);

  const unread = items.filter((n) => n.readAt === null);
  const read = items.filter((n) => n.readAt !== null);

  function handleRead(id: string) {
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => (n.id === id ? { ...n, readAt: now } : n)));
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    const previous = items;
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => (n.readAt ? n : { ...n, readAt: now })));

    const result = await markAllNotificationsRead();
    setMarkingAll(false);

    if (!result.success) {
      setItems(previous);
      showError(result.error ?? "Não foi possível marcar como lidas.");
      return;
    }
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="Nenhuma notificação"
        description="Você será avisado aqui quando for atribuído a uma atividade, receber um comentário, um prazo estiver próximo ou uma atividade relacionada for concluída."
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Não lidas{unread.length > 0 ? ` · ${unread.length}` : ""}
          </h2>
          {unread.length > 0 ? (
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
        {unread.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card/50 px-3 py-4 text-center text-ui-sm text-muted-foreground">
            Tudo lido.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {unread.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} onRead={handleRead} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {read.length > 0 ? (
        <section className="space-y-1.5">
          <h2 className="text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Anteriores
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {read.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

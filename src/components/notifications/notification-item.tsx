"use client";

import { useRouter } from "next/navigation";
import {
  AlarmClock,
  Clock,
  Link2,
  MessageSquare,
  Paperclip,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationRead } from "@/server/actions/notifications";
import type { NotificationSummary, NotificationType } from "@/server/queries/notifications";

const iconByType: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  card_assigned: { icon: UserPlus, className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" },
  comment_added: { icon: MessageSquare, className: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300" },
  attachment_added: { icon: Paperclip, className: "bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300" },
  card_due_soon: { icon: Clock, className: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" },
  card_overdue: { icon: AlarmClock, className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
  related_card_completed: { icon: Link2, className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300" },
  automation: { icon: Zap, className: "bg-cyan-100 text-cyan-900 dark:bg-cyan-500/15 dark:text-cyan-300" },
};

/**
 * Uma notificação, usada tanto no sino quanto na página completa.
 *
 * Clicar marca como lida e abre o card. A marcação é otimista: o pai
 * atualiza o estado local na hora e a action confirma no servidor.
 */
export function NotificationItem({
  item,
  onRead,
  compact = false,
}: {
  item: NotificationSummary;
  onRead?: (id: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const { icon: Icon, className } = iconByType[item.type] ?? iconByType.automation;
  const unread = item.readAt === null;
  const href = item.cardId && item.pipeId ? `/pipes/${item.pipeId}/cards/${item.cardId}` : null;

  async function handleClick() {
    if (unread) {
      onRead?.(item.id);
      void markNotificationRead(item.id);
    }
    if (href) router.push(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md text-left transition-colors hover:bg-accent",
        compact ? "px-2 py-1.5" : "px-3 py-2.5",
        !href && "cursor-default",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-full",
          compact ? "size-6" : "size-8",
          className,
        )}
      >
        <Icon className={compact ? "size-3" : "size-4"} aria-hidden />
      </span>

      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "text-ui-sm leading-snug",
              unread ? "font-semibold text-foreground" : "text-foreground/80",
            )}
          >
            {item.title}
          </span>
          <span className="tabular shrink-0 text-ui-2xs text-muted-foreground">
            {formatRelativeTime(item.createdAt)}
          </span>
        </span>
        {item.body ? (
          <span
            className={cn(
              "block text-ui-xs text-muted-foreground",
              compact ? "truncate" : "line-clamp-2",
            )}
          >
            {item.body}
          </span>
        ) : null}
      </span>

      {unread ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />
      ) : null}
    </button>
  );
}

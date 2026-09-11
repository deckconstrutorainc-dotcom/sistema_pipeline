import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Estado vazio com ação.
 *
 * Um vazio sem saída é um beco: a tela de pipe sem fases dizia apenas "este
 * pipe ainda não possui fases configuradas", sem oferecer como configurá-las.
 * Por isso `action` existe e deve ser preenchido sempre que houver um próximo
 * passo possível.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 text-center",
        size === "sm" ? "gap-1.5 p-4" : "gap-2 p-8",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
            size === "sm" ? "size-8" : "size-10",
          )}
        >
          <Icon className={size === "sm" ? "size-4" : "size-5"} aria-hidden />
        </span>
      ) : null}
      <p className={cn("font-medium", size === "sm" ? "text-ui-sm" : "text-ui-md")}>{title}</p>
      {description ? (
        <p className="max-w-sm text-ui-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

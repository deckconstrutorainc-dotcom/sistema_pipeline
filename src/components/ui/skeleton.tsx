import { cn } from "@/lib/utils";

/**
 * Bloco de carregamento. A regra de ouro: o esqueleto deve ter a silhueta da
 * página real, senão o salto do carregado para o carregando é pior que um
 * spinner.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

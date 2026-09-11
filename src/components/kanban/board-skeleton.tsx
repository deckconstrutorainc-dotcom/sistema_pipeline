import { Skeleton } from "@/components/ui/skeleton";

/**
 * Silhueta do quadro durante o carregamento.
 *
 * As faixas coloridas do topo já aparecem (em cinza) para que a transição
 * para o conteúdo real não desloque o layout.
 */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-2.5 overflow-hidden rounded-lg bg-board p-2.5">
      {Array.from({ length: columns }).map((_, columnIndex) => (
        <div
          key={columnIndex}
          className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-lg border bg-column"
        >
          <Skeleton className="h-1 rounded-none" />
          <div className="flex items-center justify-between gap-2 border-b bg-column-header px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
            </div>
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="flex flex-col gap-1.5 p-1.5">
            {Array.from({ length: 3 - (columnIndex % 2) }).map((__, cardIndex) => (
              <div
                key={cardIndex}
                className="space-y-2 rounded-md border border-tile-border bg-tile p-2.5"
              >
                <Skeleton className="h-3.5 w-4/5" />
                <div className="flex gap-1">
                  <Skeleton className="h-3 w-14 rounded" />
                  <Skeleton className="h-3 w-10 rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Silhueta de uma tabela em carregamento. Reaproveitada pelos `loading.tsx`
 * das telas que listam dados em tabela.
 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex gap-3 border-b bg-muted/60 px-2.5 py-2">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3 border-b px-2.5 py-2 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-3.5 flex-1"
              // Larguras levemente diferentes por linha: uma grade perfeita
              // parece congelada, não carregando.
              style={{ maxWidth: colIndex === 0 ? "20%" : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Cabeçalho de página em carregamento: título, descrição e ação. */
export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      {withAction ? <Skeleton className="h-8 w-28" /> : null}
    </div>
  );
}

/**
 * Estado de loading do dashboard (CLAUDE.md §12). Skeleton com a mesma
 * silhueta da página real (título + 4 KPIs + duas listas) para evitar salto
 * de layout enquanto as consultas agregadas carregam.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando dashboard">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-3 rounded-lg border p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-8 w-12 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ))}
    </div>
  );
}

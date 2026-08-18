export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        role="status"
        aria-label="Carregando"
      />
      <p className="text-sm text-muted-foreground">Carregando…</p>
    </main>
  );
}

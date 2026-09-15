/**
 * Tempo relativo em pt-BR: "agora", "há 5 min", "há 2 h", "há 3 dias".
 * Acima de 7 dias, mostra a data — "há 40 dias" não ajuda ninguém.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 45) return "agora";
  if (diffSeconds < 3600) return `há ${Math.max(1, Math.round(diffSeconds / 60))} min`;
  if (diffSeconds < 86_400) return `há ${Math.round(diffSeconds / 3600)} h`;

  const days = Math.round(diffSeconds / 86_400);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

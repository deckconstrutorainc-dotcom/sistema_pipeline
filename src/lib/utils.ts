import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina classes condicionais (clsx) e resolve conflitos de utilitários
 * Tailwind (tailwind-merge). Uso padrão em todos os componentes de UI.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

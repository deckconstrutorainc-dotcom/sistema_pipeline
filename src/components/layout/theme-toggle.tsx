"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "koryn:theme";

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Do sistema", icon: Monitor },
];

/**
 * Aplica o tema ao <html>.
 *
 * Exportada porque o script anti-flash em `theme-script.tsx` precisa da
 * mesma regra — se as duas divergirem, a página pisca na cor errada antes
 * de o React assumir.
 */
export function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
      }
    } catch {
      // Armazenamento bloqueado: segue no padrão do sistema.
    }
  }, []);

  // Com "do sistema", acompanha a troca no sistema operacional sem exigir
  // recarregar a página.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preferência não persistida; a sessão atual continua correta.
    }
  }

  // Antes da montagem o valor real ainda não foi lido do localStorage —
  // mostrar um ícone arbitrário aqui causaria troca visível.
  const current = mounted ? theme : "system";
  const Icon = options.find((o) => o.value === current)?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alternar tema">
          <Icon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => choose(option.value)}
            className={cn(current === option.value && "bg-accent text-accent-foreground")}
          >
            <option.icon className="size-3.5" aria-hidden />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

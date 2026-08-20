"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`${component} deve ser usado dentro de <Tabs>.`);
  }
  return ctx;
}

interface TabsProps {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Implementação própria e simples de tabs (estado local + `cn()`), sem
 * dependência nova — Radix UI não é dependência do projeto hoje e não há
 * necessidade técnica de adicioná-lo só para isso (CLAUDE.md §2/§13).
 * Suporta filhos server-rendered (cada `<TabsContent>` pode conter JSX
 * produzido por Server Components, já resolvido antes de chegar aqui).
 */
function Tabs({ defaultValue, children, className }: TabsProps) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-1 border-b border-border", className)}>
      {children}
    </div>
  );
}

function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = useTabsContext("TabsTrigger");
  const isActive = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useTabsContext("TabsContent");
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={cn("pt-4", className)}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

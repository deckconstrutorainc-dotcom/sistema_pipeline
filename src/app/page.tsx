import Link from "next/link";
import { ArrowRight, BarChart3, KanbanSquare, Workflow, Zap } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const highlights = [
  {
    icon: KanbanSquare,
    title: "Quadros por processo",
    description: "Cada processo com suas fases, campos e responsáveis — sem precisar programar.",
  },
  {
    icon: Zap,
    title: "Automações",
    description: "Regras de gatilho, condição e ação que movem cards e avisam quem precisa saber.",
  },
  {
    icon: Workflow,
    title: "Prazos e SLA",
    description: "Prazo por fase, alerta de vencimento e histórico completo de cada movimentação.",
  },
  {
    icon: BarChart3,
    title: "Indicadores",
    description: "Tempo por fase, gargalos e aderência ao prazo a partir do histórico real.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-10 px-5 py-12">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-ui-xs font-medium text-accent-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          Gestão de processos
        </span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Koryn Task</h1>
        <p className="max-w-xl text-ui-md text-muted-foreground">
          Organize solicitações, aprovações e tarefas em processos claros. Cada
          demanda vira um card que caminha por fases definidas, com prazo,
          responsável e histórico.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }))}>
          Acessar o sistema
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
          Entrar
        </Link>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {highlights.map((item) => (
          <li
            key={item.title}
            className="flex gap-3 rounded-lg border bg-card p-3 shadow-sm"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <item.icon className="size-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <h2 className="text-ui-md font-medium">{item.title}</h2>
              <p className="text-ui-sm text-muted-foreground">{item.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

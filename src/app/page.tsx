import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">BTS Pipe</h1>
        <p className="max-w-md text-muted-foreground">
          Plataforma independente de gestão de processos e workflows. Este é
          o marco M0 — fundação do projeto.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "default" }))}>
          Ir para o Dashboard
        </Link>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
          Entrar
        </Link>
      </div>
    </main>
  );
}

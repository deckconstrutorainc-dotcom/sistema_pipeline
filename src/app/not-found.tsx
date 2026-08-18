import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Página não encontrada
      </h1>
      <p className="max-w-md text-muted-foreground">
        O conteúdo que você procura não existe ou foi movido.
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "default" }))}>
        Voltar ao início
      </Link>
    </main>
  );
}

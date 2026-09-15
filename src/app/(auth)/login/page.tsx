import Image from "next/image";

import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-5 rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/koryn-logo.png"
          alt="Koryn Sistemas"
          width={960}
          height={356}
          priority
          className="h-auto w-40"
        />
        <div className="space-y-0.5">
          <h1 className="text-ui-lg font-semibold tracking-tight">Entrar</h1>
          <p className="text-ui-sm text-muted-foreground">
            Acesse sua conta para continuar no Koryn Task.
          </p>
        </div>
      </div>
      <LoginForm />
    </div>
  );
}

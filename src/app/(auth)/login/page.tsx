import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm text-muted-foreground">
          Acesse sua conta para continuar no BTS Pipe.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}

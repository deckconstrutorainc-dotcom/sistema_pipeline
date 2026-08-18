import { SignUpForm } from "@/components/forms/signup-form";

export default function RegisterPage() {
  return (
    <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre-se para começar a usar o BTS Pipe.
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}

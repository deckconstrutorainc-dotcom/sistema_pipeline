import { ResetPasswordForm } from "@/components/forms/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe seu e-mail para receber um link de recuperação.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}

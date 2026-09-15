import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { AuthCard } from "@/components/layout/auth-card";

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Recuperar senha"
      description="Informe seu e-mail para receber um link de recuperação."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}

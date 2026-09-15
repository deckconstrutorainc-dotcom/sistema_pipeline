import { LoginForm } from "@/components/forms/login-form";
import { AuthCard } from "@/components/layout/auth-card";

export default function LoginPage() {
  return (
    <AuthCard title="Entrar" description="Acesse sua conta para continuar no Koryn Task.">
      <LoginForm />
    </AuthCard>
  );
}

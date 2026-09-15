import { SignUpForm } from "@/components/forms/signup-form";
import { AuthCard } from "@/components/layout/auth-card";

export default function RegisterPage() {
  return (
    <AuthCard title="Criar conta" description="Cadastre-se para começar a usar o Koryn Task.">
      <SignUpForm />
    </AuthCard>
  );
}

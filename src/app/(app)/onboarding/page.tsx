import { redirect } from "next/navigation";

import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import { getActiveOrganization, requireAuth } from "@/lib/auth/session";

export default async function OnboardingPage() {
  await requireAuth();

  // Se o usuário já tem organização, não há onboarding pendente.
  const existingOrg = await getActiveOrganization();
  if (existingOrg) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Crie sua organização</h1>
        <p className="text-muted-foreground">
          Toda a plataforma é organizada por organização. Crie a primeira para continuar.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <CreateOrganizationForm />
      </div>
    </div>
  );
}

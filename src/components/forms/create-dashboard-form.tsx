"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDashboardSchema, type CreateDashboardInput } from "@/lib/validation/dashboards";
import { createDashboard } from "@/server/actions/dashboards";

interface CreateDashboardFormProps {
  organizationId: string;
}

export function CreateDashboardForm({ organizationId }: CreateDashboardFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDashboardInput>({
    resolver: zodResolver(createDashboardSchema),
    defaultValues: { organizationId, name: "" },
  });

  const onSubmit = async (values: CreateDashboardInput) => {
    setFormError(null);
    const result = await createDashboard(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o dashboard.");
      return;
    }
    reset({ organizationId, name: "" });
    if (result.dashboardId) {
      router.push(`/dashboards/${result.dashboardId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="dashboard-name">Nome do dashboard</Label>
        <Input id="dashboard-name" placeholder="Ex.: Visão geral" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar dashboard"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

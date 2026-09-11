"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createReportSchema, reportMetricValues, type CreateReportInput } from "@/lib/validation/reports";
import { createReport } from "@/server/actions/reports";

interface PipeOption {
  id: string;
  name: string;
}

interface CreateReportFormProps {
  organizationId: string;
  pipes: PipeOption[];
}

const metricLabels: Record<(typeof reportMetricValues)[number], string> = {
  phase_counts: "Cards por fase",
  avg_time_in_phase: "Tempo médio por fase",
  completion_rate: "Taxa de conclusão",
  sla_summary: "Resumo de SLA/prazo",
};

export function CreateReportForm({ organizationId, pipes }: CreateReportFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateReportInput>({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      organizationId,
      name: "",
      config: { metric: "phase_counts" },
    },
  });

  const onSubmit = async (values: CreateReportInput) => {
    setFormError(null);
    const result = await createReport(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o report.");
      return;
    }
    reset({ organizationId, name: "", config: { metric: "phase_counts" } });
    if (result.reportId) {
      router.push(`/reports/${result.reportId}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("organizationId")} />

      <div className="space-y-1">
        <Label htmlFor="report-name">Nome do report</Label>
        <Input id="report-name" placeholder="Ex.: Cards por fase" {...register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="report-metric">Métrica</Label>
        <select
          id="report-metric"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          {...register("config.metric")}
        >
          {reportMetricValues.map((metric) => (
            <option key={metric} value={metric}>
              {metricLabels[metric]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="report-pipe">Pipe (opcional — vazio = toda a organização)</Label>
        <select
          id="report-pipe"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          {...register("pipeId", { setValueAs: (v: string) => (v === "" ? undefined : v) })}
        >
          <option value="">Toda a organização</option>
          {pipes.map((pipe) => (
            <option key={pipe.id} value={pipe.id}>
              {pipe.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar report"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

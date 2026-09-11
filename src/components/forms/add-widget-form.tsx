"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addWidgetSchema, dashboardWidgetTypeValues, type AddWidgetInput } from "@/lib/validation/dashboards";
import { addWidget } from "@/server/actions/dashboards";

interface ReportOption {
  id: string;
  name: string;
}

interface AddWidgetFormProps {
  dashboardId: string;
  reports: ReportOption[];
}

const widgetTypeLabels: Record<(typeof dashboardWidgetTypeValues)[number], string> = {
  kpi: "KPI (número único)",
  bar_chart: "Barras",
  line_chart: "Linha",
  pie_chart: "Pizza",
  table: "Tabela",
  sla_summary: "Resumo de SLA",
};

export function AddWidgetForm({ dashboardId, reports }: AddWidgetFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddWidgetInput>({
    resolver: zodResolver(addWidgetSchema),
    defaultValues: {
      dashboardId,
      widgetType: "kpi",
      title: "",
      positionX: 0,
      positionY: 0,
      width: 4,
      height: 3,
    },
  });

  const onSubmit = async (values: AddWidgetInput) => {
    setFormError(null);
    const result = await addWidget(values);
    if (!result.success) {
      setFormError(result.error ?? "Não foi possível adicionar o widget.");
      return;
    }
    reset({ dashboardId, widgetType: "kpi", title: "", positionX: 0, positionY: 0, width: 4, height: 3 });
    router.refresh();
  };

  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border p-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register("dashboardId")} />

      <div className="space-y-1">
        <Label htmlFor="widget-title">Título do widget</Label>
        <Input id="widget-title" placeholder="Ex.: Cards por fase" {...register("title")} />
        {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="widget-type">Tipo</Label>
        <select
          id="widget-type"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          {...register("widgetType")}
        >
          {dashboardWidgetTypeValues.map((type) => (
            <option key={type} value={type}>
              {widgetTypeLabels[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="widget-report">Report (opcional)</Label>
        <select
          id="widget-report"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          {...register("reportId", { setValueAs: (v: string) => (v === "" ? undefined : v) })}
        >
          <option value="">Nenhum</option>
          {reports.map((report) => (
            <option key={report.id} value={report.id}>
              {report.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Adicionando..." : "Adicionar widget"}
      </Button>

      {formError ? <p className="w-full text-sm text-destructive">{formError}</p> : null}
    </form>
  );
}

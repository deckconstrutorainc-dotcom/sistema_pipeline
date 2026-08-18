"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRecord, updateRecordFields } from "@/server/actions/records";
import type { DatabaseFieldSummary } from "@/server/queries/databases";

interface RecordFieldsFormProps {
  databaseId: string;
  fields: DatabaseFieldSummary[];
  recordId?: string;
  initialValues?: Record<string, unknown>;
}

/**
 * Formulário dinâmico de valores de registro. Deliberadamente NÃO usa
 * react-hook-form/zodResolver (padrão do resto do app) porque o conjunto
 * de campos é definido em runtime por database — um schema Zod estático
 * não se aplica aqui. A validação por tipo (mesma de `validateFieldValue`)
 * acontece no servidor (`src/server/actions/records.ts`), que é a fonte
 * de verdade; este formulário só evita o óbvio (ex.: não travar submit).
 */
export function RecordFieldsForm({ databaseId, fields, recordId, initialValues }: RecordFieldsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeFields = fields.filter((f) => !f.isArchived);

  const setValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = recordId
      ? await updateRecordFields({ recordId, databaseId, fieldValues: values })
      : await createRecord({ databaseId, fieldValues: values });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar o registro.");
      return;
    }
    router.push(`/databases/${databaseId}`);
    router.refresh();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {activeFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este database ainda não possui campos configurados.</p>
      ) : (
        activeFields.map((field) => (
          <div key={field.id} className="space-y-1">
            <Label htmlFor={`field-${field.id}`}>
              {field.label}
              {field.isRequired ? " *" : ""}
            </Label>
            <FieldInput field={field} value={values[field.id]} onChange={(value) => setValue(field.id, value)} />
          </div>
        ))
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : recordId ? "Salvar alterações" : "Criar registro"}
      </Button>
    </form>
  );
}

interface FieldInputProps {
  field: DatabaseFieldSummary;
  value: unknown;
  onChange: (value: unknown) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const id = `field-${field.id}`;
  const options = Array.isArray((field.config as { options?: unknown }).options)
    ? ((field.config as { options: { value: string; label: string }[] }).options ?? [])
    : [];

  switch (field.type) {
    case "long_text":
      return (
        <textarea
          id={id}
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "number":
    case "currency":
      return (
        <Input
          id={id}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
      );
    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)}
        />
      );
    case "datetime":
      return (
        <Input
          id={id}
          type="datetime-local"
          value={typeof value === "string" ? value.slice(0, 16) : ""}
          onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)}
        />
      );
    case "checkbox":
      return (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case "email":
      return (
        <Input
          id={id}
          type="email"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "phone":
      return (
        <Input
          id={id}
          type="tel"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "single_select":
      return (
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">Selecione...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <select
          id={id}
          multiple
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((opt) => opt.value))}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    case "user":
    case "attachment":
    case "short_text":
    default:
      return (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

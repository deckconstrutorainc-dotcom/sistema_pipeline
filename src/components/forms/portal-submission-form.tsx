"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldType } from "@/lib/validation/fields";

export interface PortalFormFieldOption {
  value: string;
  label: string;
}

export interface PortalFormField {
  fieldId: string;
  label: string;
  type: FieldType;
  helpText: string | null;
  placeholder: string | null;
  isRequired: boolean;
  options: PortalFormFieldOption[];
}

interface PortalSubmissionFormProps {
  slug: string;
  fields: PortalFormField[];
  visibility: "public" | "restricted";
}

/**
 * Formulário público de submissão de portal. Deliberadamente sem
 * react-hook-form (mesmo padrão de `record-fields-form.tsx`, M4): o
 * conjunto de campos é definido em runtime por portal. A validação
 * autoritativa acontece no servidor (rota `/api/portals/[slug]/submit`,
 * que reaproveita `validateFieldValue` + o RPC `submit_portal_request`) —
 * este componente só evita o óbvio antes do envio.
 */
export function PortalSubmissionForm({ slug, fields, visibility }: PortalSubmissionFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);

  const setValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/portals/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldValues: values,
          requesterName: requesterName || undefined,
          requesterEmail: requesterEmail || undefined,
          accessCode: visibility === "restricted" ? accessCode || undefined : undefined,
        }),
      });
      const result = (await response.json()) as { success: boolean; error?: string; protocol?: string };
      if (!result.success) {
        setError(result.error ?? "Não foi possível enviar a solicitação.");
        return;
      }
      setProtocol(result.protocol ?? null);
    } catch {
      setError("Não foi possível enviar a solicitação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (protocol) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold">Solicitação enviada</h2>
        <p className="text-sm text-muted-foreground">
          Guarde o protocolo abaixo para acompanhar o andamento da sua solicitação.
        </p>
        <p className="rounded-md border bg-muted px-4 py-2 font-mono text-lg font-semibold">{protocol}</p>
        <Link href="/portal/status" className="text-sm text-primary underline-offset-4 hover:underline">
          Consultar status de uma solicitação
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="requester-name">Seu nome</Label>
          <Input
            id="requester-name"
            value={requesterName}
            onChange={(event) => setRequesterName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="requester-email">Seu e-mail</Label>
          <Input
            id="requester-email"
            type="email"
            value={requesterEmail}
            onChange={(event) => setRequesterEmail(event.target.value)}
          />
        </div>
      </div>

      {visibility === "restricted" ? (
        <div className="space-y-1">
          <Label htmlFor="access-code">Código de acesso *</Label>
          <Input
            id="access-code"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
          />
        </div>
      ) : null}

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este portal ainda não possui campos configurados.</p>
      ) : (
        fields.map((field) => (
          <div key={field.fieldId} className="space-y-1">
            <Label htmlFor={`portal-field-${field.fieldId}`}>
              {field.label}
              {field.isRequired ? " *" : ""}
            </Label>
            <PortalFieldInput field={field} value={values[field.fieldId]} onChange={(value) => setValue(field.fieldId, value)} />
            {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
          </div>
        ))
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Enviando..." : "Enviar solicitação"}
      </Button>
    </form>
  );
}

interface PortalFieldInputProps {
  field: PortalFormField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function PortalFieldInput({ field, value, onChange }: PortalFieldInputProps) {
  const id = `portal-field-${field.fieldId}`;

  switch (field.type) {
    case "long_text":
      return (
        <textarea
          id={id}
          placeholder={field.placeholder ?? undefined}
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
          placeholder={field.placeholder ?? undefined}
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
          placeholder={field.placeholder ?? undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "phone":
      return (
        <Input
          id={id}
          type="tel"
          placeholder={field.placeholder ?? undefined}
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
          {field.options.map((opt) => (
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
          {field.options.map((opt) => (
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
          placeholder={field.placeholder ?? undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

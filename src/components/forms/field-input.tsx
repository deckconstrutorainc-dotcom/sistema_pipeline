"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldSummary } from "@/server/queries/pipes";

export interface FieldInputProps {
  field: FieldSummary;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Usado pelo `<label htmlFor>` de quem renderiza. */
  id?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  disabled?: boolean;
}

/**
 * Entrada de um campo dinâmico, por tipo.
 *
 * Extraído de `create-card-form.tsx` para ser compartilhado entre a criação
 * e a edição inline do card — o mesmo campo precisa se comportar igual nos
 * dois lugares (CLAUDE.md §13).
 *
 * `user` e `attachment` não têm entrada própria aqui: o primeiro é resolvido
 * pelos responsáveis do card e o segundo depende do Supabase Storage, ainda
 * não integrado.
 */
export function FieldInput({
  field,
  value,
  onChange,
  id,
  autoFocus,
  onBlur,
  onKeyDown,
  disabled,
}: FieldInputProps) {
  const inputId = id ?? `card-field-${field.id}`;
  const common = { id: inputId, autoFocus, onBlur, onKeyDown, disabled };

  switch (field.type) {
    case "long_text":
      return (
        <Textarea
          {...common}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "number":
    case "currency":
      return (
        <Input
          {...common}
          type="number"
          step={field.type === "currency" ? "0.01" : undefined}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? null : Number(event.target.value))
          }
        />
      );

    case "date":
      return (
        <Input
          {...common}
          type="date"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(event) => onChange(event.target.value || null)}
        />
      );

    case "datetime":
      return (
        <Input
          {...common}
          type="datetime-local"
          value={typeof value === "string" ? value.slice(0, 16) : ""}
          onChange={(event) => onChange(event.target.value || null)}
        />
      );

    case "checkbox":
      return (
        <Checkbox
          id={inputId}
          disabled={disabled}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );

    case "email":
      return (
        <Input
          {...common}
          type="email"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "phone":
      return (
        <Input
          {...common}
          type="tel"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "single_select":
      return (
        <select
          {...common}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-ui-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          {...common}
          multiple
          className="w-full rounded-md border border-input bg-card px-2 py-1 text-ui-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={selected}
          onChange={(event) =>
            onChange(Array.from(event.target.selectedOptions).map((opt) => opt.value))
          }
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
      return (
        <p className="text-ui-xs text-muted-foreground">
          {field.type === "user"
            ? "Use os responsáveis do card."
            : "Anexos ainda dependem da configuração de armazenamento."}
        </p>
      );

    case "short_text":
    default:
      return (
        <Input
          {...common}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

/** Tipos que não podem ser editados inline (não têm entrada própria). */
export function isFieldEditable(type: string): boolean {
  return type !== "user" && type !== "attachment";
}

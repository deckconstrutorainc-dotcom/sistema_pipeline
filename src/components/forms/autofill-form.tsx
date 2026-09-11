"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { autofillFromRecord } from "@/server/actions/connections";
import type { AutofillMappingEntryInput } from "@/lib/validation/databases";

interface CardFieldOption {
  fieldId: string;
  label: string;
  type: string;
}

interface DatabaseFieldOption {
  key: string;
  label: string;
  type: string;
}

interface AutofillFormProps {
  cardId: string;
  pipeId: string;
  recordId: string;
  databaseFields: DatabaseFieldOption[];
  cardFields: CardFieldOption[];
}

/**
 * Mapeamento manual (não salvo) database_field.key -> field.id do pipe,
 * feito a cada autofill — ver limitação documentada em
 * `autofillFromRecordSchema`. Só oferece como destino campos do card com
 * o MESMO tipo do campo de origem, para reduzir a chance de o servidor
 * pular a entrada por incompatibilidade de tipo.
 */
export function AutofillForm({ cardId, pipeId, recordId, databaseFields, cardFields }: AutofillFormProps) {
  const router = useRouter();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ applied: number; skipped: number } | null>(null);

  const handleApply = async () => {
    const entries: AutofillMappingEntryInput[] = Object.entries(mapping)
      .filter(([, fieldId]) => fieldId)
      .map(([databaseFieldKey, fieldId]) => ({ databaseFieldKey, fieldId }));

    if (entries.length === 0) {
      setError("Selecione ao menos um campo de destino.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const result = await autofillFromRecord({ cardId, pipeId, recordId, mapping: entries });
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível aplicar o autofill.");
      return;
    }

    setSummary({ applied: result.applied?.length ?? 0, skipped: result.skipped?.length ?? 0 });
    router.refresh();
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">Autofill: preencher campos do card a partir deste registro</p>
      {databaseFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este database não possui campos configurados.</p>
      ) : (
        <div className="space-y-2">
          {databaseFields.map((dbField) => {
            const compatibleCardFields = cardFields.filter((f) => f.type === dbField.type);
            return (
              <div key={dbField.key} className="flex items-center gap-2 text-sm">
                <span className="w-40 truncate text-muted-foreground">{dbField.label}</span>
                <span>→</span>
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={mapping[dbField.key] ?? ""}
                  onChange={(event) => setMapping((prev) => ({ ...prev, [dbField.key]: event.target.value }))}
                  disabled={compatibleCardFields.length === 0}
                >
                  <option value="">
                    {compatibleCardFields.length === 0 ? "Nenhum campo compatível no card" : "Não preencher"}
                  </option>
                  {compatibleCardFields.map((f) => (
                    <option key={f.fieldId} value={f.fieldId}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          <Button type="button" size="sm" disabled={isSubmitting} onClick={handleApply}>
            {isSubmitting ? "Aplicando..." : "Aplicar autofill"}
          </Button>
        </div>
      )}
      {summary ? (
        <p className="text-sm text-muted-foreground">
          {summary.applied} campo(s) preenchido(s), {summary.skipped} ignorado(s).
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

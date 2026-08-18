"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PortalItemSummary } from "@/server/queries/portals";
import { configurePortalItems } from "@/server/actions/portals";

interface PipeFieldOption {
  id: string;
  label: string;
  type: string;
}

interface ConfigurePortalItemsFormProps {
  portalId: string;
  pipeId: string;
  pipeFields: PipeFieldOption[];
  initialItems: PortalItemSummary[];
}

interface ItemState {
  selected: boolean;
  requiredOverride: boolean;
}

/**
 * Define quais campos do pipe aparecem no formulário público do portal
 * (portal_items) e se algum deles deve virar obrigatório só no formulário
 * externo (`is_required_override`) — nunca o contrário: esta UI só oferece
 * a caixa "obrigatório no portal" quando marcada, nunca uma forma de
 * afrouxar obrigatoriedade interna (mesma restrição imposta no banco).
 */
export function ConfigurePortalItemsForm({
  portalId,
  pipeId,
  pipeFields,
  initialItems,
}: ConfigurePortalItemsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialState = new Map(initialItems.map((item) => [item.fieldId, item]));
  const [state, setState] = useState<Record<string, ItemState>>(() => {
    const map: Record<string, ItemState> = {};
    for (const field of pipeFields) {
      const existing = initialState.get(field.id);
      map[field.id] = {
        selected: Boolean(existing),
        requiredOverride: existing?.isRequiredOverride === true,
      };
    }
    return map;
  });

  const toggleSelected = (fieldId: string) => {
    setState((prev) => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], selected: !prev[fieldId]?.selected, requiredOverride: prev[fieldId]?.requiredOverride ?? false },
    }));
  };

  const toggleRequired = (fieldId: string) => {
    setState((prev) => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], requiredOverride: !prev[fieldId]?.requiredOverride, selected: prev[fieldId]?.selected ?? false },
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    const items = pipeFields
      .filter((field) => state[field.id]?.selected)
      .map((field, index) => ({
        fieldId: field.id,
        position: index,
        isRequiredOverride: state[field.id]?.requiredOverride ? true : null,
      }));

    const result = await configurePortalItems({ portalId, pipeId, items });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível salvar os campos do portal.");
      return;
    }
    router.refresh();
  };

  if (pipeFields.length === 0) {
    return <p className="text-sm text-muted-foreground">Este pipe ainda não possui campos configurados.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {pipeFields.map((field) => (
          <li key={field.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state[field.id]?.selected ?? false}
                onChange={() => toggleSelected(field.id)}
              />
              <span>
                {field.label} <span className="text-xs text-muted-foreground">({field.type})</span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={state[field.id]?.requiredOverride ?? false}
                disabled={!state[field.id]?.selected}
                onChange={() => toggleRequired(field.id)}
              />
              Obrigatório no portal
            </label>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" size="sm" disabled={isSubmitting} onClick={handleSubmit}>
        {isSubmitting ? "Salvando..." : "Salvar campos do portal"}
      </Button>
    </div>
  );
}

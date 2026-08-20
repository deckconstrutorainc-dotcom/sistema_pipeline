"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCard } from "@/server/actions/cards";
import { isFieldValueEmpty } from "@/lib/validation/fields";
import type { FieldSummary } from "@/server/queries/pipes";
import type { OrganizationMemberOption } from "@/server/queries/organizations";

interface CreateCardFormProps {
  pipeId: string;
  fields: FieldSummary[];
  /** Ids de campos marcados como obrigatórios na fase inicial do pipe
   * (`phase_fields.is_required` — CLAUDE.md §10/§14). Usado só para dar
   * feedback visual no formulário; a validação que realmente vale é a do
   * servidor (`createCard`), que por sua vez confia no banco. */
  requiredFieldIds: string[];
  members: OrganizationMemberOption[];
}

/**
 * Botão "+ Novo card" que abre um modal com título, prazo, responsável e os
 * campos customizados do pipe — substitui o antigo formulário inline que só
 * pedia o título (pedido do usuário: "abrir um pop-up para preencher as
 * informações do card").
 *
 * Assim como `record-fields-form.tsx` (M4), o bloco de campos dinâmicos não
 * usa react-hook-form/zodResolver porque o conjunto de campos é definido em
 * runtime por pipe; a validação por tipo é a mesma de `validateFieldValue`
 * (`src/lib/validation/fields.ts`), que roda de verdade no servidor.
 *
 * Simplificação deliberada (documentada no relatório da tarefa): os tipos
 * `user` e `attachment` não são editáveis aqui na criação — exigiriam,
 * respectivamente, um segundo seletor de usuário por campo (distinto do
 * responsável do card) e upload de arquivo antes do card existir. Ambos
 * continuam editáveis depois, na página do card.
 */
export function CreateCardForm({ pipeId, fields, requiredFieldIds, members }: CreateCardFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiredSet = new Set(requiredFieldIds);
  const activeFields = fields.filter((f) => !f.isArchived);

  function resetForm() {
    setTitle("");
    setDueDate("");
    setAssigneeId("");
    setFieldValues({});
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function setFieldValue(fieldId: string, value: unknown) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Informe o título do card.");
      return;
    }

    const missingRequired = activeFields.filter(
      (f) => requiredSet.has(f.id) && isFieldValueEmpty(fieldValues[f.id]),
    );
    if (missingRequired.length > 0) {
      setFormError(
        `Preencha os campos obrigatórios: ${missingRequired.map((f) => f.label).join(", ")}.`,
      );
      return;
    }

    setIsSubmitting(true);
    const result = await createCard({
      pipeId,
      title: trimmedTitle,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      fieldValues,
      assigneeId: assigneeId || null,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível criar o card.");
      return;
    }

    handleOpenChange(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + Novo card
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent onClose={() => handleOpenChange(false)}>
          <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>Novo card</DialogTitle>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="card-title">Título *</Label>
                <Input
                  id="card-title"
                  placeholder="Título do card"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="card-due-date">Prazo</Label>
                <Input
                  id="card-due-date"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="card-assignee">Responsável</Label>
                <select
                  id="card-assignee"
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  <option value="">Sem responsável</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName ?? "Sem nome"}
                    </option>
                  ))}
                </select>
              </div>

              {activeFields.length > 0 ? (
                <div className="space-y-4 border-t pt-4">
                  {activeFields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label htmlFor={`card-field-${field.id}`}>
                        {field.label}
                        {requiredSet.has(field.id) ? " *" : ""}
                      </Label>
                      <CardFieldInput
                        field={field}
                        value={fieldValues[field.id]}
                        onChange={(value) => setFieldValue(field.id, value)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Criando..." : "Adicionar card"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface CardFieldInputProps {
  field: FieldSummary;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Renderização por tipo de campo, mesmo padrão de `record-fields-form.tsx`
 * (M4) adaptado ao formato de `FieldSummary` (opções já vêm como array, sem
 * o `config.options` usado pelos campos de database). */
function CardFieldInput({ field, value, onChange }: CardFieldInputProps) {
  const id = `card-field-${field.id}`;

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
      return (
        <p className="text-xs text-muted-foreground">
          Este tipo de campo pode ser preenchido depois, na página do card.
        </p>
      );
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

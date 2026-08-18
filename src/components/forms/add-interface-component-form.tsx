"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  interfaceComponentTypeValues,
  type InterfaceComponentType,
} from "@/lib/validation/interfaces";
import { addComponent } from "@/server/actions/interfaces";

interface SelectOption {
  id: string;
  name: string;
}

interface AddInterfaceComponentFormProps {
  interfaceId: string;
  dashboards: SelectOption[];
  pipes: SelectOption[];
  databases: SelectOption[];
}

const componentTypeLabels: Record<InterfaceComponentType, string> = {
  dashboard_embed: "Dashboard",
  pipe_view: "Pipe (kanban)",
  database_view: "Database",
  text_block: "Bloco de texto",
};

/**
 * Formulário de composição de `interface_components` (M6 — item que ficava
 * como TODO documentado na página de detalhe da interface). Não é um
 * builder drag-and-drop: o usuário escolhe o tipo, preenche a referência
 * (dashboard/pipe/database) ou o texto, e define largura/altura na mesma
 * grade de 12 colunas já usada para renderizar os componentes — mesmo nível
 * de simplicidade já aceito para `dashboard_widgets` (sem drag-and-drop,
 * grid fixo).
 */
export function AddInterfaceComponentForm({
  interfaceId,
  dashboards,
  pipes,
  databases,
}: AddInterfaceComponentFormProps) {
  const router = useRouter();
  const [componentType, setComponentType] = useState<InterfaceComponentType>(
    interfaceComponentTypeValues[0],
  );
  const [referenceId, setReferenceId] = useState("");
  const [text, setText] = useState("");
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(4);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referenceOptions: SelectOption[] =
    componentType === "dashboard_embed" ? dashboards : componentType === "pipe_view" ? pipes : databases;

  const needsReference = componentType !== "text_block";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (needsReference && !referenceId) {
      setError("Selecione uma referência para este componente.");
      return;
    }
    if (componentType === "text_block" && text.trim().length === 0) {
      setError("Informe o texto do bloco.");
      return;
    }

    const config: Record<string, unknown> =
      componentType === "dashboard_embed"
        ? { dashboardId: referenceId }
        : componentType === "pipe_view"
          ? { pipeId: referenceId }
          : componentType === "database_view"
            ? { databaseId: referenceId }
            : { text: text.trim() };

    setIsSubmitting(true);
    const result = await addComponent({
      interfaceId,
      componentType,
      config,
      positionX: 0,
      positionY: 0,
      width,
      height,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível adicionar o componente.");
      return;
    }

    setReferenceId("");
    setText("");
    router.refresh();
  };

  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border p-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1">
        <Label htmlFor="component-type">Tipo</Label>
        <select
          id="component-type"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={componentType}
          onChange={(event) => {
            setComponentType(event.target.value as InterfaceComponentType);
            setReferenceId("");
          }}
        >
          {interfaceComponentTypeValues.map((type) => (
            <option key={type} value={type}>
              {componentTypeLabels[type]}
            </option>
          ))}
        </select>
      </div>

      {needsReference ? (
        <div className="space-y-1">
          <Label htmlFor="component-reference">Referência</Label>
          <select
            id="component-reference"
            className="h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm"
            value={referenceId}
            onChange={(event) => setReferenceId(event.target.value)}
          >
            <option value="">Selecione...</option>
            {referenceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="w-full space-y-1">
          <Label htmlFor="component-text">Texto</Label>
          <textarea
            id="component-text"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Texto exibido neste bloco da interface."
          />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="component-width">Largura (1-12)</Label>
        <Input
          id="component-width"
          type="number"
          min={1}
          max={12}
          className="w-24"
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="component-height">Altura</Label>
        <Input
          id="component-height"
          type="number"
          min={1}
          max={12}
          className="w-24"
          value={height}
          onChange={(event) => setHeight(Number(event.target.value))}
        />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Adicionando..." : "Adicionar componente"}
      </Button>

      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

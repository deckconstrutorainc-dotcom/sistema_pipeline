"use client";

import { Mic, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCard } from "@/server/actions/cards";
import { isFieldValueEmpty } from "@/lib/validation/fields";
import type { FieldSummary } from "@/server/queries/pipes";
import type { OrganizationMemberOption } from "@/server/queries/organizations";
import type { VoiceExtractionData } from "@/server/services/voice-card-extraction";

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

  /**
   * Pré-preenche o formulário a partir do resultado de
   * `/api/ai/voice-card-extraction` — NUNCA envia o card automaticamente
   * (o usuário ainda precisa revisar e clicar em "Adicionar card", CLAUDE.md
   * §3.27-3.29). Só sobrescreve campos que a IA de fato extraiu; o que já
   * estava preenchido manualmente antes de gravar e não foi reconhecido no
   * áudio permanece como estava.
   */
  function applyVoiceExtraction(data: VoiceExtractionData) {
    if (data.title) setTitle(data.title);
    if (data.dueDate) setDueDate(data.dueDate.slice(0, 16));
    if (data.assigneeId) setAssigneeId(data.assigneeId);
    if (Object.keys(data.fieldValues).length > 0) {
      setFieldValues((prev) => ({ ...prev, ...data.fieldValues }));
    }
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
              <VoiceRecordButton pipeId={pipeId} onExtracted={applyVoiceExtraction} />

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

const MAX_RECORDING_SECONDS = 90;

interface VoiceRecordButtonProps {
  pipeId: string;
  onExtracted: (data: VoiceExtractionData) => void;
}

type RecordingStatus = "idle" | "recording" | "processing" | "error";

/**
 * Botão "Gravar por voz" (feature Voz -> Card, M8): grava um áudio curto via
 * `MediaRecorder` (`audio/webm`, leve e suportado nativamente pelo Gemini),
 * envia para `POST /api/ai/voice-card-extraction` e pré-preenche o
 * formulário com o resultado via `onExtracted` — NUNCA envia o card sozinho
 * (o usuário revisa e clica em "Adicionar card" normalmente, CLAUDE.md
 * §3.27-3.29).
 *
 * Limite de 90s (`MAX_RECORDING_SECONDS`): a gravação para automaticamente
 * ao atingir o limite, evitando um payload grande demais para o Route
 * Handler (ver comentário de limite de payload em
 * `src/app/api/ai/voice-card-extraction/route.ts`).
 *
 * Requer contexto seguro (HTTPS ou localhost — exigência do próprio
 * `getUserMedia`) e suporte a `MediaRecorder`. Quando ausente, o botão fica
 * oculto com um aviso discreto em vez de quebrar o formulário — o usuário
 * sempre pode preencher manualmente.
 */
function VoiceRecordButton({ pipeId, onExtracted }: VoiceRecordButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIsSupported(
      typeof navigator !== "undefined" &&
        typeof window !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof window.MediaRecorder !== "undefined",
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopStream() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function handleRecordingStopped() {
    setStatus("processing");
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const base64 = await blobToBase64(blob);

      const response = await fetch("/api/ai/voice-card-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeId, audioBase64: base64, mimeType: "audio/webm" }),
      });

      const result = (await response.json()) as {
        success: boolean;
        error?: string;
        data?: VoiceExtractionData;
      };

      if (!response.ok || !result.success || !result.data) {
        setError(result.error ?? "Não foi possível transcrever o áudio. Preencha manualmente.");
        setStatus("error");
        return;
      }

      onExtracted(result.data);
      setStatus("idle");
      setElapsedSeconds(0);
    } catch {
      setError("Falha de conexão ao enviar o áudio para análise. Preencha manualmente.");
      setStatus("error");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopStream();
        void handleRecordingStopped();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
      setElapsedSeconds(0);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            recorder.stop();
          }
          return next;
        });
      }, 1000);
    } catch {
      setError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
      setStatus("error");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  if (!isSupported) {
    return (
      <p className="text-xs text-muted-foreground">
        Gravação por voz não está disponível neste navegador — preencha os campos manualmente.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Preencher por voz</p>
          <p className="text-xs text-muted-foreground">
            Descreva o card em voz alta (até {MAX_RECORDING_SECONDS}s) — a IA pré-preenche os campos abaixo, você
            revisa antes de confirmar.
          </p>
        </div>
        {status === "recording" ? (
          <Button type="button" variant="destructive" size="sm" onClick={stopRecording}>
            <Square className="h-4 w-4" /> Parar ({elapsedSeconds}s)
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            disabled={status === "processing"}
          >
            <Mic className="h-4 w-4" />
            {status === "processing" ? "Transcrevendo..." : "Gravar por voz"}
          </Button>
        )}
      </div>
      {status === "recording" ? (
        <p className="text-xs text-muted-foreground">
          Gravando... a gravação para automaticamente aos {MAX_RECORDING_SECONDS}s.
        </p>
      ) : null}
      {status === "processing" ? (
        <p className="text-xs text-muted-foreground">Transcrevendo e analisando com IA...</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Converte o Blob gravado para base64 puro (sem o prefixo `data:...;base64,`
 * da data URL), formato que o Route Handler espera no corpo JSON. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Falha ao ler o áudio gravado."));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Falha ao converter o áudio gravado."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o áudio gravado."));
    reader.readAsDataURL(blob);
  });
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

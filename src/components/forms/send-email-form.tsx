"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logOutboundEmail } from "@/server/actions/email";

interface SendEmailFormProps {
  cardId: string;
  defaultFromAddress: string;
}

/**
 * Registra (e tenta enviar via `EmailProvider`) um e-mail outbound
 * vinculado ao card. O envio real depende do provider configurado — em
 * dev/teste usa `ConsoleEmailProvider` (não envia de verdade, só loga e
 * marca a mensagem como enviada para fins de fluxo/UI).
 *
 * Deliberadamente sem react-hook-form/zodResolver aqui: o campo
 * "destinatários" é digitado como texto separado por vírgula e precisa ser
 * transformado em array ANTES da validação Zod — a validação autoritativa
 * (`logOutboundEmailSchema`) acontece no server action, que é a fonte de
 * verdade; este componente só evita o óbvio (campos vazios) antes do
 * envio.
 */
export function SendEmailForm({ cardId, defaultFromAddress }: SendEmailFormProps) {
  const router = useRouter();
  const [toAddressesRaw, setToAddressesRaw] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await logOutboundEmail({
      cardId,
      fromAddress: defaultFromAddress,
      toAddresses: toAddressesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      subject,
      body,
    });
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível enviar o e-mail.");
      return;
    }
    setToAddressesRaw("");
    setSubject("");
    setBody("");
    router.refresh();
  };

  return (
    <form className="space-y-2 rounded-md border p-3" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1">
        <Label htmlFor="email-to">Para (separados por vírgula)</Label>
        <Input
          id="email-to"
          placeholder="cliente@exemplo.com"
          value={toAddressesRaw}
          onChange={(event) => setToAddressesRaw(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email-subject">Assunto</Label>
        <Input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email-body">Mensagem</Label>
        <textarea
          id="email-body"
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : "Enviar e-mail"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

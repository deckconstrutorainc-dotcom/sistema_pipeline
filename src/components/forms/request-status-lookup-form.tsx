"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

interface RequestStatus {
  protocol: string;
  status: "in_progress" | "completed" | "archived";
  phase_name: string;
  submitted_at: string;
}

const statusLabels: Record<RequestStatus["status"], string> = {
  in_progress: "Em andamento",
  completed: "Concluída",
  archived: "Arquivada",
};

/**
 * Consulta pública de status por protocolo — chama diretamente o RPC
 * `get_request_status_by_protocol` (SECURITY DEFINER, `grant to anon`) a
 * partir do client de browser (chave `anon`, sem sessão). Não exige login;
 * é a mesma superfície pública descrita em CLAUDE.md M5.
 */
export function RequestStatusLookupForm() {
  const [protocol, setProtocol] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RequestStatus | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    if (!protocol.trim()) {
      setError("Informe o protocolo da solicitação.");
      return;
    }
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("get_request_status_by_protocol", {
        p_protocol: protocol.trim(),
      });
      if (rpcError) {
        setError("Não foi possível consultar o protocolo informado.");
        return;
      }
      const rows = (data as RequestStatus[] | null) ?? [];
      if (rows.length === 0) {
        setError("Protocolo não encontrado. Verifique se foi digitado corretamente.");
        return;
      }
      setResult(rows[0] ?? null);
    } catch {
      setError("Não foi possível consultar o protocolo informado.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form className="flex items-end gap-3" onSubmit={handleSubmit} noValidate>
        <div className="flex-1 space-y-1">
          <Label htmlFor="protocol">Protocolo</Label>
          <Input
            id="protocol"
            placeholder="ORG-20260818-0001"
            value={protocol}
            onChange={(event) => setProtocol(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Consultando..." : "Consultar"}
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {result ? (
        <div className="space-y-1 rounded-lg border bg-card p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Protocolo:</span>{" "}
            <span className="font-mono font-medium">{result.protocol}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Status:</span> {statusLabels[result.status]}
          </p>
          <p>
            <span className="text-muted-foreground">Fase atual:</span> {result.phase_name}
          </p>
          <p>
            <span className="text-muted-foreground">Enviado em:</span>{" "}
            {new Date(result.submitted_at).toLocaleString("pt-BR")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

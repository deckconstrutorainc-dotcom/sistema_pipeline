"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Avisos efêmeros de ação.
 *
 * Antes, o erro de uma server action virava um `<div>` inline acima do
 * conteúdo — no quadro, o usuário podia nem ver, porque o aviso ficava fora
 * da área visível depois do scroll. Sucesso não dava retorno nenhum.
 *
 * Escrito à mão (sem Radix): não há posicionamento flutuante nem navegação
 * por teclado complexa aqui — só um portal e um temporizador. É o caso em
 * que a dependência não se justifica (ADR-0004).
 */

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DURATION_MS = 5000;

const variantStyles: Record<ToastVariant, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  error: { icon: AlertCircle, className: "border-red-300 bg-red-50 text-red-900" },
  info: { icon: Info, className: "border-border bg-card text-foreground" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const nextId = React.useRef(0);

  React.useEffect(() => setMounted(true), []);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      // Erro fica mais tempo: o usuário costuma precisar ler o motivo.
      const duration = variant === "error" ? DURATION_MS * 1.6 : DURATION_MS;
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              // `pointer-events-none` no container e `auto` em cada aviso:
              // a área vazia entre eles não deve bloquear cliques na página.
              className="pointer-events-none fixed bottom-3 right-3 z-[100] flex w-full max-w-sm flex-col gap-2"
              role="region"
              aria-label="Avisos"
            >
              {toasts.map((item) => {
                const { icon: Icon, className } = variantStyles[item.variant];
                return (
                  <div
                    key={item.id}
                    role="status"
                    aria-live={item.variant === "error" ? "assertive" : "polite"}
                    className={cn(
                      "pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-ui-sm shadow-lg animate-slide-in-right",
                      className,
                    )}
                  >
                    <Icon className="mt-px size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">{item.message}</span>
                    <button
                      type="button"
                      onClick={() => dismiss(item.id)}
                      className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
                      aria-label="Fechar aviso"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

/**
 * Fora de um ToastProvider devolve funções vazias em vez de lançar: um
 * componente reaproveitado numa árvore sem provider não deve quebrar a tela
 * por causa de um aviso.
 */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (context) return context;
  return {
    toast: () => undefined,
    success: () => undefined,
    error: () => undefined,
  };
}

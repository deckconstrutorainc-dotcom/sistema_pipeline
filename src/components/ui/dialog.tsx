"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Modal/dialog simples, construído do zero (sem Radix/Headless UI — não há
 * dependência de dialog no projeto, CLAUDE.md pede para não adicionar uma
 * lib grande sem necessidade técnica comprovada). Renderiza via
 * `createPortal` em `document.body` para não sofrer com z-index/overflow
 * dentro do Kanban (colunas com `overflow-x`/`overflow-y` cortariam um
 * modal posicionado `absolute` dentro da árvore).
 *
 * Comportamento:
 * - fecha ao clicar no overlay, ao apertar Escape, ou pelo botão "X";
 * - foco inicial no primeiro elemento focável do conteúdo (não é um trap de
 *   foco completo/WCAG — decisão deliberada de escopo, ver CLAUDE.md §13,
 *   "bom senso, sem exagerar o escopo" no prompt desta tarefa);
 * - em mobile ocupa quase a tela toda, com scroll interno próprio.
 */
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // Trava o scroll do body enquanto o modal está aberto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose: () => void;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onClose, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(forwardedRef, () => internalRef.current as HTMLDivElement);

    React.useEffect(() => {
      const container = internalRef.current;
      if (!container) return;
      const focusable = container.querySelector<HTMLElement>(
        "input, textarea, select, button:not([data-dialog-close])",
      );
      // Foco inicial no primeiro campo do formulário (bom senso de UX, não
      // um trap de foco WCAG completo — ver comentário no topo do arquivo).
      (focusable ?? container).focus();
    }, []);

    return (
      <div
        ref={internalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative flex max-h-screen w-full flex-col overflow-hidden bg-background shadow-lg outline-none",
          "h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg sm:border",
          className,
        )}
        {...props}
      >
        <button
          type="button"
          data-dialog-close
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    );
  },
);
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1 border-b px-6 py-4 pr-10", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

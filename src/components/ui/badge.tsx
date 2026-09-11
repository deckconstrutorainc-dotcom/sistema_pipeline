import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // `rounded` em vez de `rounded-full`: chips retangulares leem como dado,
  // pílulas leem como decoração.
  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-ui-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/12 text-destructive",
        outline: "border-border text-foreground",
        success: "border-transparent bg-emerald-100 text-emerald-800",
        warning: "border-transparent bg-amber-100 text-amber-900",
        info: "border-transparent bg-sky-100 text-sky-900",
        /** Neutro de baixo peso, para metadados que não devem competir. */
        soft: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Marcador circular à esquerda do texto (status, fase). */
  dot?: boolean;
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden />
      ) : null}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };

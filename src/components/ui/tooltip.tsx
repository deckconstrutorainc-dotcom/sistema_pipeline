"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 5, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        "z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-ui-xs text-background shadow-md animate-fade-in",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

/**
 * Atalho para o caso comum: envolver um elemento e dar-lhe uma dica.
 *
 * Numa interface densa, ícones sem rótulo são a regra — este componente evita
 * repetir a tríade Root/Trigger/Content em cada uso.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delayDuration = 300,
  asChild = true,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
  asChild?: boolean;
}) {
  if (!content) return <>{children}</>;

  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };

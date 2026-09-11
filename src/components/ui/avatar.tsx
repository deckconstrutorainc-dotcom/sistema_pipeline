"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { getAvatarColor } from "@/lib/phase-colors";
import { cn } from "@/lib/utils";

/**
 * Iniciais (até 2 letras) a partir do nome.
 * Antes vivia duplicada dentro de `card-tile.tsx`.
 */
export function initials(name: string | null | undefined): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const sizeClasses = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-ui-2xs",
  md: "size-8 text-ui-xs",
  lg: "size-10 text-ui-sm",
} as const;

export interface AvatarProps {
  /** Nome completo; vira as iniciais e o `title`. */
  name: string | null | undefined;
  /**
   * Semente da cor — use o id do usuário para que a mesma pessoa tenha
   * sempre a mesma cor em todas as telas.
   */
  seed?: string;
  src?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
  /** Anel na cor do fundo do container, para pilhas sobrepostas. */
  ring?: boolean;
}

export function Avatar({
  name,
  seed,
  src,
  size = "sm",
  className,
  ring = false,
}: AvatarProps) {
  const label = name?.trim() || "Sem nome";
  const color = getAvatarColor(seed ?? label);

  return (
    <AvatarPrimitive.Root
      title={label}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold",
        sizeClasses[size],
        ring && "ring-2 ring-card",
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image
          src={src}
          alt={label}
          className="size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className={cn("flex size-full items-center justify-center", color.bg, color.text)}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/**
 * Pilha de avatares sobrepostos com indicador de excedente.
 */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: readonly { id: string; fullName: string | null }[];
  max?: number;
  size?: keyof typeof sizeClasses;
}) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <div className="flex -space-x-1.5">
      {visible.map((person) => (
        <Avatar
          key={person.id}
          name={person.fullName}
          seed={person.id}
          size={size}
          ring
        />
      ))}
      {overflow > 0 ? (
        <span
          title={`mais ${overflow}`}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card",
            sizeClasses[size],
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

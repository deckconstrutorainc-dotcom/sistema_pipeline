"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { switchOrganization } from "@/server/actions/organizations";

export interface OrgSwitcherOption {
  id: string;
  name: string;
}

interface OrgSwitcherProps {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
}

/**
 * Seletor de organização ativa. Só é útil quando o usuário pertence a mais
 * de uma organização; a página que renderiza este componente decide se ele
 * aparece (ex.: `organizations.length > 1`).
 */
export function OrgSwitcher({ organizations, activeOrganizationId }: OrgSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (organizationId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await switchOrganization({ organizationId });
      if (!result.success) {
        setError(result.error ?? "Não foi possível trocar de organização.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Organização ativa"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
        value={activeOrganizationId}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

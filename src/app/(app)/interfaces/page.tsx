import Link from "next/link";

import { CreateInterfaceForm } from "@/components/forms/create-interface-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listInterfaces } from "@/server/queries/interfaces";

export default async function InterfacesPage() {
  const organization = await requireActiveOrganization();
  const [interfaces, canManageInterfaces] = await Promise.all([
    listInterfaces(organization.id),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  // Membros não-admin só veem interfaces publicadas (admins veem tudo,
  // inclusive rascunhos, para poder configurá-las).
  const visibleInterfaces = canManageInterfaces
    ? interfaces
    : interfaces.filter((i) => i.isPublished);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Interfaces</h1>
        <p className="text-muted-foreground">
          Telas internas personalizadas de <strong>{organization.name}</strong> — combine dashboards,
          visões de pipe/database e blocos de texto em uma tela própria.
        </p>
      </div>

      {canManageInterfaces ? <CreateInterfaceForm organizationId={organization.id} /> : null}

      {visibleInterfaces.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhuma interface disponível ainda.</p>
          {canManageInterfaces ? (
            <p className="text-sm">Use o formulário acima para criar a primeira interface.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para publicar uma interface.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleInterfaces.map((iface) => (
            <Link key={iface.id} href={`/interfaces/${iface.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle>{iface.name}</CardTitle>
                  {!iface.isPublished ? <Badge variant="secondary">Rascunho</Badge> : null}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {iface.description ?? "Sem descrição."}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

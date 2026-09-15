import { Columns3 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreatePipeForm } from "@/components/forms/create-pipe-form";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listPipes } from "@/server/actions/pipes";

export default async function PipesPage() {
  const organization = await requireActiveOrganization();
  const [pipes, canManagePipes] = await Promise.all([
    listPipes(),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pipes</h1>
        <p className="text-muted-foreground">
          Processos de <strong>{organization.name}</strong>.
        </p>
      </div>

      {canManagePipes ? <CreatePipeForm organizationId={organization.id} /> : null}

      {pipes.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Nenhum processo criado ainda"
          description={
            canManagePipes
              ? "Um processo organiza um tipo de demanda em fases — por exemplo Compras: Solicitação, Cotação, Aprovação e Entrega. Use o formulário acima para criar o primeiro."
              : "Peça a um administrador da organização para criar o primeiro processo."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pipes.map((pipe) => (
            <Link key={pipe.id} href={`/pipes/${pipe.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle>{pipe.name}</CardTitle>
                  {pipe.isRestricted ? <Badge variant="secondary">Restrito</Badge> : null}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{pipe.description ?? "Sem descrição."}</span>
                  <span className="whitespace-nowrap">{pipe.cardCount} card(s)</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

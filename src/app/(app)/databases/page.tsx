import Link from "next/link";

import { CreateDatabaseForm } from "@/components/forms/create-database-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { listDatabases } from "@/server/queries/databases";

export default async function DatabasesPage() {
  const organization = await requireActiveOrganization();
  const [databases, canManageDatabases] = await Promise.all([
    listDatabases(organization.id),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Databases</h1>
        <p className="text-muted-foreground">
          Tabelas de dados compartilhadas de <strong>{organization.name}</strong> — use para cadastros
          reutilizáveis (fornecedores, equipamentos, contratos...) e conecte a cards para preencher campos
          automaticamente.
        </p>
      </div>

      {canManageDatabases ? <CreateDatabaseForm organizationId={organization.id} /> : null}

      {databases.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Nenhum database criado ainda.</p>
          {canManageDatabases ? (
            <p className="text-sm">Use o formulário acima para criar o primeiro database.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para criar um database.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {databases.map((database) => (
            <Link key={database.id} href={`/databases/${database.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle>{database.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{database.description ?? "Sem descrição."}</span>
                  <span className="whitespace-nowrap">{database.recordCount} registro(s)</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";

import { CreateDatabaseFieldForm } from "@/components/forms/create-database-field-form";
import { Button } from "@/components/ui/button";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { getDatabaseDetail, listRecords } from "@/server/queries/databases";

interface DatabasePageProps {
  params: Promise<{ databaseId: string }>;
  searchParams: Promise<{ q?: string }>;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export default async function DatabaseDetailPage({ params, searchParams }: DatabasePageProps) {
  const { databaseId } = await params;
  const { q } = await searchParams;
  const organization = await requireActiveOrganization();

  const database = await getDatabaseDetail(databaseId);

  if (!database) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Database não encontrado</h1>
        <p className="text-muted-foreground">
          Este database não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href="/databases" className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Databases
        </Link>
      </div>
    );
  }

  const [records, canManageStructure] = await Promise.all([
    listRecords(databaseId, { query: q }),
    hasOrgRole(organization.id, ["super_admin", "admin"]),
  ]);

  const activeFields = database.fields.filter((f) => !f.isArchived);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/databases" className="text-sm text-muted-foreground hover:underline">
            Databases
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{database.name}</h1>
          {database.description ? <p className="text-muted-foreground">{database.description}</p> : null}
        </div>
        <Link href={`/databases/${databaseId}/records/new`}>
          <Button>Novo registro</Button>
        </Link>
      </div>

      {canManageStructure ? (
        <details className="rounded-lg border">
          <summary className="cursor-pointer select-none p-4 text-sm font-semibold">
            Gerenciar campos ({activeFields.length})
          </summary>
          <div className="space-y-4 border-t p-4">
            <CreateDatabaseFieldForm databaseId={databaseId} />
            {activeFields.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {activeFields.map((field) => (
                  <li key={field.id} className="flex items-center justify-between">
                    <span>
                      {field.label} <span className="text-muted-foreground">({field.type})</span>
                      {field.isRequired ? <span className="text-destructive"> *</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">chave: {field.key}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

      <form className="flex items-center gap-2" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por título..."
          className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {activeFields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Este database ainda não possui campos configurados.</p>
          {canManageStructure ? (
            <p className="text-sm">Use &quot;Gerenciar campos&quot; acima para adicionar o primeiro campo.</p>
          ) : (
            <p className="text-sm">Peça a um administrador da organização para configurar os campos.</p>
          )}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>{q ? "Nenhum registro encontrado para essa busca." : "Nenhum registro criado ainda."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Título</th>
                {activeFields.map((field) => (
                  <th key={field.id} className="p-3 font-medium">
                    {field.label}
                  </th>
                ))}
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t">
                  <td className="p-3 font-medium">{record.title}</td>
                  {activeFields.map((field) => (
                    <td key={field.id} className="p-3 text-muted-foreground">
                      {formatCellValue(record.values[field.id])}
                    </td>
                  ))}
                  <td className="p-3 text-right">
                    <Link
                      href={`/databases/${databaseId}/records/${record.id}`}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

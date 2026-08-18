import Link from "next/link";

import { RecordFieldsForm } from "@/components/forms/record-fields-form";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getDatabaseDetail } from "@/server/queries/databases";

interface NewRecordPageProps {
  params: Promise<{ databaseId: string }>;
}

export default async function NewRecordPage({ params }: NewRecordPageProps) {
  const { databaseId } = await params;
  await requireActiveOrganization();

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

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link href={`/databases/${databaseId}`} className="text-sm text-muted-foreground hover:underline">
          {database.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Novo registro</h1>
      </div>
      <RecordFieldsForm databaseId={databaseId} fields={database.fields} />
    </div>
  );
}

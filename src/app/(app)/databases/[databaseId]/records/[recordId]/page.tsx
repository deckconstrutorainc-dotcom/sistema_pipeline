import Link from "next/link";

import { ArchiveRecordButton } from "@/components/forms/archive-record-button";
import { RecordFieldsForm } from "@/components/forms/record-fields-form";
import { requireActiveOrganization } from "@/lib/auth/session";
import { getDatabaseDetail, getRecordDetail } from "@/server/queries/databases";

interface EditRecordPageProps {
  params: Promise<{ databaseId: string; recordId: string }>;
}

export default async function EditRecordPage({ params }: EditRecordPageProps) {
  const { databaseId, recordId } = await params;
  await requireActiveOrganization();

  const [database, record] = await Promise.all([getDatabaseDetail(databaseId), getRecordDetail(recordId)]);

  if (!database || !record || record.databaseId !== databaseId) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Registro não encontrado</h1>
        <p className="text-muted-foreground">
          Este registro não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link href={`/databases/${databaseId}`} className="text-sm text-primary underline-offset-4 hover:underline">
          Voltar para o database
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href={`/databases/${databaseId}`} className="text-sm text-muted-foreground hover:underline">
            {database.name}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{record.title}</h1>
        </div>
        <ArchiveRecordButton
          recordId={recordId}
          databaseId={databaseId}
          isArchived={record.isArchived}
        />
      </div>
      <RecordFieldsForm
        databaseId={databaseId}
        fields={database.fields}
        recordId={recordId}
        initialValues={record.values}
      />
    </div>
  );
}

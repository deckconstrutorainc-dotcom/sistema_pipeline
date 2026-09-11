import Link from "next/link";

import { AutofillForm } from "@/components/forms/autofill-form";
import { ConnectCardForm } from "@/components/forms/connect-card-form";
import { ConnectRecordForm } from "@/components/forms/connect-record-form";
import { DisconnectCardButton, DisconnectRecordButton } from "@/components/forms/disconnect-buttons";
import { getCardConnections, getDatabaseDetail, listDatabases } from "@/server/queries/databases";

interface CardConnectionsSectionProps {
  cardId: string;
  pipeId: string;
  organizationId: string;
  cardFields: { fieldId: string; label: string; type: string }[];
}

/**
 * Seção de conexões (M4 — Data Hub) na página de detalhe do card:
 * conectar/desconectar a um record de um database, conectar/desconectar a
 * outro card, e aplicar autofill a partir de um record conectado.
 */
export async function CardConnectionsSection({
  cardId,
  pipeId,
  organizationId,
  cardFields,
}: CardConnectionsSectionProps) {
  const [connections, databases] = await Promise.all([getCardConnections(cardId), listDatabases(organizationId)]);

  const connectedDatabases = await Promise.all(
    connections.records.map((r) => getDatabaseDetail(r.databaseId)),
  );

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Conexões (Data Hub)</h2>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Registros conectados</p>
        {connections.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro conectado.</p>
        ) : (
          <ul className="space-y-3">
            {connections.records.map((connection, index) => {
              const database = connectedDatabases[index];
              const activeFields = (database?.fields ?? []).filter((f) => !f.isArchived);
              return (
                <li key={connection.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <Link
                        href={`/databases/${connection.databaseId}/records/${connection.recordId}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {connection.recordTitle}
                      </Link>
                      <span className="text-muted-foreground"> — {connection.databaseName}</span>
                    </div>
                    <DisconnectRecordButton cardId={cardId} pipeId={pipeId} recordId={connection.recordId} />
                  </div>
                  <AutofillForm
                    cardId={cardId}
                    pipeId={pipeId}
                    recordId={connection.recordId}
                    databaseFields={activeFields.map((f) => ({ key: f.key, label: f.label, type: f.type }))}
                    cardFields={cardFields}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <ConnectRecordForm
          cardId={cardId}
          pipeId={pipeId}
          databases={databases}
          alreadyConnectedRecordIds={connections.records.map((r) => r.recordId)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Cards conectados</p>
        {connections.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum card conectado.</p>
        ) : (
          <ul className="space-y-1">
            {connections.cards.map((connection) => (
              <li key={connection.id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/pipes/${connection.pipeId}/cards/${connection.cardId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  #{connection.cardNumber} {connection.cardTitle}
                </Link>
                <DisconnectCardButton cardId={cardId} pipeId={pipeId} otherCardId={connection.cardId} />
              </li>
            ))}
          </ul>
        )}
        <ConnectCardForm cardId={cardId} pipeId={pipeId} />
      </div>
    </section>
  );
}

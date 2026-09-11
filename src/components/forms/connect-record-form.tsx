"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectCardToRecord } from "@/server/actions/connections";
import { searchRecords } from "@/server/actions/records";
import type { DatabaseSummary } from "@/server/queries/databases";

interface ConnectRecordFormProps {
  cardId: string;
  pipeId: string;
  databases: DatabaseSummary[];
  alreadyConnectedRecordIds: readonly string[];
}

interface SearchResult {
  id: string;
  title: string;
}

export function ConnectRecordForm({ cardId, pipeId, databases, alreadyConnectedRecordIds }: ConnectRecordFormProps) {
  const router = useRouter();
  const [databaseId, setDatabaseId] = useState(databases[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (databases.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum database disponível para conectar.</p>;
  }

  const handleSearch = async () => {
    if (!databaseId) return;
    setIsSearching(true);
    setError(null);
    const records = await searchRecords({ databaseId, query, includeArchived: false });
    setIsSearching(false);
    setResults(records.map((r) => ({ id: r.id, title: r.title })));
  };

  const handleConnect = async (recordId: string) => {
    setError(null);
    const result = await connectCardToRecord({ cardId, pipeId, recordId });
    if (!result.success) {
      setError(result.error ?? "Não foi possível conectar o registro.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium text-muted-foreground">Conectar a um registro</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={databaseId}
          onChange={(event) => {
            setDatabaseId(event.target.value);
            setResults([]);
          }}
        >
          {databases.map((db) => (
            <option key={db.id} value={db.id}>
              {db.name}
            </option>
          ))}
        </select>
        <Input
          className="h-9 max-w-xs"
          placeholder="Buscar por título..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="button" size="sm" variant="outline" disabled={isSearching} onClick={handleSearch}>
          {isSearching ? "Buscando..." : "Buscar"}
        </Button>
      </div>
      {results.length > 0 ? (
        <ul className="space-y-1">
          {results.map((record) => {
            const alreadyConnected = alreadyConnectedRecordIds.includes(record.id);
            return (
              <li key={record.id} className="flex items-center justify-between text-sm">
                <span>{record.title}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={alreadyConnected}
                  onClick={() => handleConnect(record.id)}
                >
                  {alreadyConnected ? "Já conectado" : "Conectar"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { resolveRecordTitle, type FieldType } from "@/lib/validation/databases";

export interface DatabaseSummary {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  isArchived: boolean;
  recordCount: number;
}

/** Lista os databases da organização (RLS já filtra por `is_org_member`). */
export async function listDatabases(organizationId: string, includeArchived = false): Promise<DatabaseSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("databases")
    .select("id, organization_id, name, description, icon, is_archived, records(count)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  interface Row {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    icon: string | null;
    is_archived: boolean;
    records: { count: number }[] | null;
  }

  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    isArchived: row.is_archived,
    recordCount: row.records?.[0]?.count ?? 0,
  }));
}

export interface DatabaseFieldSummary {
  id: string;
  databaseId: string;
  label: string;
  key: string;
  type: FieldType;
  isRequired: boolean;
  position: number;
  isArchived: boolean;
  config: Record<string, unknown>;
}

export interface DatabaseDetail {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  isArchived: boolean;
  titleFieldId: string | null;
  fields: DatabaseFieldSummary[];
}

/** Detalhe de um database + seus campos, ordenados por position. */
export async function getDatabaseDetail(databaseId: string): Promise<DatabaseDetail | null> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("databases")
    .select("id, organization_id, name, description, icon, is_archived, title_field_id")
    .eq("id", databaseId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      name: string;
      description: string | null;
      icon: string | null;
      is_archived: boolean;
      title_field_id: string | null;
    }>();

  if (error || !row) {
    return null;
  }

  const { data: fieldsData } = await supabase
    .from("database_fields")
    .select("id, database_id, label, key, type, is_required, position, is_archived, config")
    .eq("database_id", databaseId)
    .order("position", { ascending: true });

  interface FieldRow {
    id: string;
    database_id: string;
    label: string;
    key: string;
    type: string;
    is_required: boolean;
    position: number;
    is_archived: boolean;
    config: Record<string, unknown> | null;
  }

  const fields = ((fieldsData ?? []) as FieldRow[]).map((f) => ({
    id: f.id,
    databaseId: f.database_id,
    label: f.label,
    key: f.key,
    type: f.type as FieldType,
    isRequired: f.is_required,
    position: f.position,
    isArchived: f.is_archived,
    config: f.config ?? {},
  }));

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    isArchived: row.is_archived,
    titleFieldId: row.title_field_id,
    fields,
  };
}

export interface RecordSummary {
  id: string;
  databaseId: string;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
}

/**
 * Lista registros de um database com busca básica por texto (no título
 * denormalizado) e filtro exato por valor de campo (fieldFilters:
 * database_field_id -> valor). Filtro por campo é aplicado em memória
 * após a busca por interseção de record_ids — volume esperado de um
 * database (dezenas/centenas de registros) não justifica uma query SQL
 * mais sofisticada nesta primeira versão do M4.
 */
export async function listRecords(
  databaseId: string,
  options: { query?: string; fieldFilters?: Record<string, unknown>; includeArchived?: boolean } = {},
): Promise<RecordSummary[]> {
  const supabase = await createClient();

  let recordsQuery = supabase
    .from("records")
    .select("id, database_id, title, is_archived, created_at, updated_at")
    .eq("database_id", databaseId)
    .order("updated_at", { ascending: false });

  if (!options.includeArchived) {
    recordsQuery = recordsQuery.eq("is_archived", false);
  }
  if (options.query) {
    recordsQuery = recordsQuery.ilike("title", `%${options.query}%`);
  }

  const { data: recordsData, error } = await recordsQuery;
  if (error || !recordsData) {
    return [];
  }

  interface RecordRow {
    id: string;
    database_id: string;
    title: string;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
  }

  let records = recordsData as RecordRow[];

  const { data: valuesData } = await supabase
    .from("record_values")
    .select("record_id, database_field_id, value")
    .in(
      "record_id",
      records.map((r) => r.id),
    );

  interface ValueRow {
    record_id: string;
    database_field_id: string;
    value: unknown;
  }

  const valuesByRecord = new Map<string, Record<string, unknown>>();
  for (const row of (valuesData ?? []) as ValueRow[]) {
    const bucket = valuesByRecord.get(row.record_id) ?? {};
    bucket[row.database_field_id] = row.value;
    valuesByRecord.set(row.record_id, bucket);
  }

  const fieldFilters = options.fieldFilters;
  if (fieldFilters && Object.keys(fieldFilters).length > 0) {
    records = records.filter((r) => {
      const values = valuesByRecord.get(r.id) ?? {};
      return Object.entries(fieldFilters).every(([fieldId, expected]) => {
        return JSON.stringify(values[fieldId] ?? null) === JSON.stringify(expected ?? null);
      });
    });
  }

  return records.map((r) => ({
    id: r.id,
    databaseId: r.database_id,
    title: r.title,
    isArchived: r.is_archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    values: valuesByRecord.get(r.id) ?? {},
  }));
}

/** Detalhe de um único registro (para formulário de edição). */
export async function getRecordDetail(recordId: string): Promise<RecordSummary | null> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("records")
    .select("id, database_id, title, is_archived, created_at, updated_at")
    .eq("id", recordId)
    .maybeSingle<{
      id: string;
      database_id: string;
      title: string;
      is_archived: boolean;
      created_at: string;
      updated_at: string;
    }>();

  if (error || !row) {
    return null;
  }

  const { data: valuesData } = await supabase
    .from("record_values")
    .select("database_field_id, value")
    .eq("record_id", recordId);

  const values: Record<string, unknown> = {};
  for (const v of (valuesData ?? []) as { database_field_id: string; value: unknown }[]) {
    values[v.database_field_id] = v.value;
  }

  return {
    id: row.id,
    databaseId: row.database_id,
    title: row.title,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    values,
  };
}

/** Recalcula/expõe o título de um registro a partir de valores em memória
 * — reaproveitado pelos server actions de criação/edição de registro. */
export { resolveRecordTitle };

// ---------------------------------------------------------------------
// Conexões de um card (record <-> card e card <-> card), para a seção de
// "Conexões" na página de detalhe do card (M2).
// ---------------------------------------------------------------------

export interface CardRecordConnectionEntry {
  id: string;
  recordId: string;
  recordTitle: string;
  databaseId: string;
  databaseName: string;
}

export interface CardCardConnectionEntry {
  id: string;
  cardId: string;
  cardNumber: number;
  cardTitle: string;
  pipeId: string;
}

export interface CardConnections {
  records: CardRecordConnectionEntry[];
  cards: CardCardConnectionEntry[];
}

export async function getCardConnections(cardId: string): Promise<CardConnections> {
  const supabase = await createClient();

  const [recordConnRes, cardConnARes, cardConnBRes] = await Promise.all([
    supabase
      .from("card_record_connections")
      .select("id, record_id, records(id, title, database_id, databases(name))")
      .eq("card_id", cardId),
    supabase
      .from("card_card_connections")
      .select("id, card_id_b, cards!card_card_connections_card_id_b_fkey(id, number, title, pipe_id)")
      .eq("card_id_a", cardId),
    supabase
      .from("card_card_connections")
      .select("id, card_id_a, cards!card_card_connections_card_id_a_fkey(id, number, title, pipe_id)")
      .eq("card_id_b", cardId),
  ]);

  interface RecordConnRow {
    id: string;
    record_id: string;
    records: { id: string; title: string; database_id: string; databases: { name: string } | null } | null;
  }

  const records = ((recordConnRes.data ?? []) as unknown as RecordConnRow[])
    .filter((row) => row.records !== null)
    .map((row) => ({
      id: row.id,
      recordId: row.record_id,
      recordTitle: row.records!.title,
      databaseId: row.records!.database_id,
      databaseName: row.records!.databases?.name ?? "",
    }));

  interface CardConnRow {
    id: string;
    cards: { id: string; number: number; title: string; pipe_id: string } | null;
  }

  const cardsFromA = ((cardConnARes.data ?? []) as unknown as CardConnRow[])
    .filter((row) => row.cards !== null)
    .map((row) => ({
      id: row.id,
      cardId: row.cards!.id,
      cardNumber: row.cards!.number,
      cardTitle: row.cards!.title,
      pipeId: row.cards!.pipe_id,
    }));

  const cardsFromB = ((cardConnBRes.data ?? []) as unknown as CardConnRow[])
    .filter((row) => row.cards !== null)
    .map((row) => ({
      id: row.id,
      cardId: row.cards!.id,
      cardNumber: row.cards!.number,
      cardTitle: row.cards!.title,
      pipeId: row.cards!.pipe_id,
    }));

  return { records, cards: [...cardsFromA, ...cardsFromB] };
}

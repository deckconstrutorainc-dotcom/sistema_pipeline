import { z } from "zod";

import { fieldTypes, isFieldValueEmpty, optionBasedFieldTypes, validateFieldValue, type FieldType } from "@/lib/validation/fields";

// Reexporta o catálogo de tipos do M2 (CLAUDE.md §3.19 — evite duplicação
// de código): database_fields usa EXATAMENTE o mesmo catálogo de `fields`
// (ver comentário em `supabase/migrations/20260818092200_database_fields.sql`).
export { fieldTypes as databaseFieldTypes, isFieldValueEmpty, optionBasedFieldTypes, validateFieldValue };
export type { FieldType };

const databaseFieldKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe a chave do campo.")
  .max(60, "Chave muito longa.")
  .regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore.");

const selectOptionSchema = z.object({
  value: z.string().trim().min(1, "Informe o valor da opção.").max(120),
  label: z.string().trim().min(1, "Informe o rótulo da opção.").max(120),
});
export type SelectOptionInput = z.infer<typeof selectOptionSchema>;

// ---------------------------------------------------------------------
// databases
// ---------------------------------------------------------------------

export const createDatabaseSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  name: z.string().trim().min(2, "Informe o nome do database.").max(120, "Nome muito longo."),
  description: z.string().trim().max(2000, "Descrição muito longa.").optional(),
  icon: z.string().trim().max(60).optional(),
});
export type CreateDatabaseInput = z.infer<typeof createDatabaseSchema>;

export const updateDatabaseSchema = z.object({
  databaseId: z.string().uuid("Database inválido."),
  name: z.string().trim().min(2, "Informe o nome do database.").max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  icon: z.string().trim().max(60).optional(),
  titleFieldId: z.string().uuid().nullable().optional(),
});
export type UpdateDatabaseInput = z.infer<typeof updateDatabaseSchema>;

export const archiveDatabaseSchema = z.object({
  databaseId: z.string().uuid("Database inválido."),
  isArchived: z.boolean(),
});
export type ArchiveDatabaseInput = z.infer<typeof archiveDatabaseSchema>;

// ---------------------------------------------------------------------
// database_fields
// ---------------------------------------------------------------------

export const createDatabaseFieldSchema = z
  .object({
    databaseId: z.string().uuid("Database inválido."),
    label: z.string().trim().min(1, "Informe o rótulo do campo.").max(120),
    key: databaseFieldKeySchema,
    type: z.enum(fieldTypes),
    isRequired: z.boolean().default(false),
    options: z.array(selectOptionSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (optionBasedFieldTypes.includes(data.type) && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Campos de seleção precisam de ao menos uma opção.",
        path: ["options"],
      });
    }
  });
export type CreateDatabaseFieldInput = z.infer<typeof createDatabaseFieldSchema>;

export const updateDatabaseFieldSchema = z.object({
  databaseFieldId: z.string().uuid("Campo inválido."),
  databaseId: z.string().uuid("Database inválido."),
  label: z.string().trim().min(1, "Informe o rótulo do campo.").max(120).optional(),
  isRequired: z.boolean().optional(),
  position: z.number().int().optional(),
  options: z.array(selectOptionSchema).optional(),
});
export type UpdateDatabaseFieldInput = z.infer<typeof updateDatabaseFieldSchema>;

export const archiveDatabaseFieldSchema = z.object({
  databaseFieldId: z.string().uuid("Campo inválido."),
  databaseId: z.string().uuid("Database inválido."),
  isArchived: z.boolean(),
});
export type ArchiveDatabaseFieldInput = z.infer<typeof archiveDatabaseFieldSchema>;

// ---------------------------------------------------------------------
// records
// ---------------------------------------------------------------------

export const createRecordSchema = z.object({
  databaseId: z.string().uuid("Database inválido."),
  fieldValues: z.record(z.string().uuid(), z.unknown()).optional(),
});
export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export const updateRecordFieldsSchema = z.object({
  recordId: z.string().uuid("Registro inválido."),
  databaseId: z.string().uuid("Database inválido."),
  fieldValues: z.record(z.string().uuid(), z.unknown()).optional(),
});
export type UpdateRecordFieldsInput = z.infer<typeof updateRecordFieldsSchema>;

export const archiveRecordSchema = z.object({
  recordId: z.string().uuid("Registro inválido."),
  databaseId: z.string().uuid("Database inválido."),
  isArchived: z.boolean(),
});
export type ArchiveRecordInput = z.infer<typeof archiveRecordSchema>;

export const searchRecordsSchema = z.object({
  databaseId: z.string().uuid("Database inválido."),
  query: z.string().trim().max(200).optional(),
  fieldFilters: z.record(z.string().uuid(), z.unknown()).optional(),
  includeArchived: z.boolean().default(false),
});
export type SearchRecordsInput = z.infer<typeof searchRecordsSchema>;

// ---------------------------------------------------------------------
// connections
// ---------------------------------------------------------------------

export const connectCardToRecordSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  recordId: z.string().uuid("Registro inválido."),
});
export type ConnectCardToRecordInput = z.infer<typeof connectCardToRecordSchema>;

export const disconnectCardFromRecordSchema = connectCardToRecordSchema;
export type DisconnectCardFromRecordInput = z.infer<typeof disconnectCardFromRecordSchema>;

export const connectCardToCardSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  otherCardId: z.string().uuid("Card de destino inválido."),
});
export type ConnectCardToCardInput = z.infer<typeof connectCardToCardSchema>;

export const disconnectCardFromCardSchema = connectCardToCardSchema;
export type DisconnectCardFromCardInput = z.infer<typeof disconnectCardFromCardSchema>;

/**
 * Mapeamento manual (não persistido) informado no momento do autofill:
 * para cada entrada, copia o valor do campo `databaseFieldKey` do record
 * para o campo `fieldId` do card. Limitação documentada (CLAUDE.md/
 * PROMPT_MESTRE M4): não é um sistema de mapeamento salvo/reutilizável —
 * o usuário escolhe o mapeamento a cada autofill via UI.
 */
export const autofillMappingEntrySchema = z.object({
  databaseFieldKey: z.string().trim().min(1),
  fieldId: z.string().uuid("Campo de destino inválido."),
});
export type AutofillMappingEntryInput = z.infer<typeof autofillMappingEntrySchema>;

export const autofillFromRecordSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  recordId: z.string().uuid("Registro inválido."),
  mapping: z.array(autofillMappingEntrySchema).min(1, "Configure ao menos um mapeamento de campo."),
});
export type AutofillFromRecordInput = z.infer<typeof autofillFromRecordSchema>;

// ---------------------------------------------------------------------
// Cálculo de título do registro — lógica pura (sem I/O), usada tanto pelos
// server actions (createRecord/updateRecordFields) quanto em testes
// unitários. Ver comentário em `records.sql` sobre a estratégia.
// ---------------------------------------------------------------------

export interface RecordTitleFieldCandidate {
  id: string;
  type: FieldType;
  position: number;
  isArchived?: boolean;
}

export const FALLBACK_RECORD_TITLE = "Registro sem título";

/**
 * Resolve o título de um registro: (1) valor do campo configurado como
 * `titleFieldId`, se houver e não estiver vazio; senão (2) o primeiro
 * campo texto (short_text/long_text) não arquivado, ordenado por
 * `position`, que tenha valor; senão (3) `FALLBACK_RECORD_TITLE`.
 */
export function resolveRecordTitle(
  fields: readonly RecordTitleFieldCandidate[],
  values: Readonly<Record<string, unknown>>,
  titleFieldId?: string | null,
): string {
  if (titleFieldId) {
    const value = values[titleFieldId];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  const textFields = fields
    .filter((f) => !f.isArchived && (f.type === "short_text" || f.type === "long_text"))
    .slice()
    .sort((a, b) => a.position - b.position);

  for (const field of textFields) {
    const value = values[field.id];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return FALLBACK_RECORD_TITLE;
}

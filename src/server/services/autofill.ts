/**
 * Autofill (M4 — Data Hub): copia valores de `record_values` de um record
 * conectado a um card para `card_field_values`, a partir de um mapeamento
 * manual informado pelo usuário no momento da conexão (não é um sistema de
 * mapeamento salvo/reutilizável nesta primeira versão — ver comentário em
 * `src/lib/validation/databases.ts:autofillFromRecordSchema`).
 *
 * Este arquivo contém SOMENTE lógica pura (sem I/O, sem Supabase), mesmo
 * padrão de `src/server/services/automation-engine.ts` — testável em
 * `tests/unit/autofill.test.ts`. A camada com efeito colateral (buscar os
 * valores reais, gravar em card_field_values, registrar auditoria) fica em
 * `src/server/actions/connections.ts`, que importa e reutiliza
 * `resolveAutofill` em vez de duplicar a lógica.
 */
import { validateFieldValue, type FieldType } from "@/lib/validation/fields";

export interface RecordFieldSnapshot {
  databaseFieldId: string;
  key: string;
  type: FieldType;
  value: unknown;
}

export interface CardFieldTarget {
  fieldId: string;
  type: FieldType;
}

export interface AutofillMappingEntry {
  databaseFieldKey: string;
  fieldId: string;
}

export interface AutofillApplied {
  fieldId: string;
  value: unknown;
}

export interface AutofillSkipped {
  fieldId: string;
  databaseFieldKey: string;
  reason: string;
}

export interface AutofillResult {
  applied: AutofillApplied[];
  skipped: AutofillSkipped[];
}

/**
 * Resolve, a partir de um mapeamento `database_fields.key -> fields.id`,
 * quais `card_field_values` resultariam do autofill de um record num
 * card — sem gravar nada. Nunca sobrescreve cegamente um campo de tipo
 * incompatível: cada entrada do mapeamento só entra em `applied` quando o
 * campo de origem existe, o campo de destino existe, os TIPOS são iguais
 * (compatibilidade mínima exigida — CLAUDE.md M4: "validar tipos
 * compatíveis o mínimo necessário") e o valor passa em
 * `validateFieldValue` para o tipo de destino. Caso contrário, a entrada
 * vai para `skipped` com o motivo.
 */
export function resolveAutofill(
  mapping: readonly AutofillMappingEntry[],
  recordFields: readonly RecordFieldSnapshot[],
  cardFields: readonly CardFieldTarget[],
): AutofillResult {
  const recordFieldsByKey = new Map(recordFields.map((f) => [f.key, f]));
  const cardFieldsById = new Map(cardFields.map((f) => [f.fieldId, f]));

  const applied: AutofillApplied[] = [];
  const skipped: AutofillSkipped[] = [];

  for (const entry of mapping) {
    const sourceField = recordFieldsByKey.get(entry.databaseFieldKey);
    const targetField = cardFieldsById.get(entry.fieldId);

    if (!sourceField) {
      skipped.push({
        fieldId: entry.fieldId,
        databaseFieldKey: entry.databaseFieldKey,
        reason: "Campo de origem não encontrado no registro.",
      });
      continue;
    }

    if (!targetField) {
      skipped.push({
        fieldId: entry.fieldId,
        databaseFieldKey: entry.databaseFieldKey,
        reason: "Campo de destino não encontrado no card.",
      });
      continue;
    }

    if (sourceField.type !== targetField.type) {
      skipped.push({
        fieldId: entry.fieldId,
        databaseFieldKey: entry.databaseFieldKey,
        reason: `Tipos incompatíveis (${sourceField.type} -> ${targetField.type}).`,
      });
      continue;
    }

    const validation = validateFieldValue(targetField.type, sourceField.value, { required: false });
    if (!validation.valid) {
      skipped.push({
        fieldId: entry.fieldId,
        databaseFieldKey: entry.databaseFieldKey,
        reason: validation.error ?? "Valor inválido para o campo de destino.",
      });
      continue;
    }

    applied.push({ fieldId: entry.fieldId, value: sourceField.value });
  }

  return { applied, skipped };
}

import { z } from "zod";

/**
 * Tipos de campo suportados no M2 (CLAUDE.md §22 / PROMPT_MESTRE M2).
 * Espelha exatamente o `check` constraint de `public.fields.type` na
 * migration `20260818090300_fields.sql` — qualquer novo tipo precisa ser
 * adicionado nos dois lugares.
 */
export const fieldTypes = [
  "short_text",
  "long_text",
  "number",
  "currency",
  "date",
  "datetime",
  "single_select",
  "multi_select",
  "checkbox",
  "email",
  "phone",
  "user",
  "attachment",
] as const;
export type FieldType = (typeof fieldTypes)[number];

/** Tipos que exigem ao menos uma opção configurada (`field_options`). */
export const optionBasedFieldTypes: readonly FieldType[] = ["single_select", "multi_select"];

const fieldKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe a chave do campo.")
  .max(60, "Chave muito longa.")
  .regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore.");

const fieldOptionSchema = z.object({
  value: z.string().trim().min(1, "Informe o valor da opção.").max(120),
  label: z.string().trim().min(1, "Informe o rótulo da opção.").max(120),
});
export type FieldOptionInput = z.infer<typeof fieldOptionSchema>;

export const createFieldSchema = z
  .object({
    pipeId: z.string().uuid("Pipe inválido."),
    label: z.string().trim().min(1, "Informe o rótulo do campo.").max(120),
    fieldKey: fieldKeySchema,
    type: z.enum(fieldTypes),
    helpText: z.string().trim().max(500).optional(),
    placeholder: z.string().trim().max(120).optional(),
    defaultValue: z.unknown().optional(),
    options: z.array(fieldOptionSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (optionBasedFieldTypes.includes(data.type)) {
      if (!data.options || data.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Campos de seleção precisam de ao menos uma opção.",
          path: ["options"],
        });
      }
    }
  });
export type CreateFieldInput = z.infer<typeof createFieldSchema>;

export const updateFieldSchema = z.object({
  fieldId: z.string().uuid("Campo inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  label: z.string().trim().min(1, "Informe o rótulo do campo.").max(120).optional(),
  helpText: z.string().trim().max(500).optional(),
  placeholder: z.string().trim().max(120).optional(),
  defaultValue: z.unknown().optional(),
  position: z.number().int().optional(),
});
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;

export const archiveFieldSchema = z.object({
  fieldId: z.string().uuid("Campo inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  isArchived: z.boolean(),
});
export type ArchiveFieldInput = z.infer<typeof archiveFieldSchema>;

export const setPhaseFieldSchema = z.object({
  pipeId: z.string().uuid("Pipe inválido."),
  phaseId: z.string().uuid("Fase inválida."),
  fieldId: z.string().uuid("Campo inválido."),
  isRequired: z.boolean().default(false),
  isVisible: z.boolean().default(true),
});
export type SetPhaseFieldInput = z.infer<typeof setPhaseFieldSchema>;

/**
 * Validação pura (sem I/O) do valor de um campo dinâmico, por tipo. Usada
 * tanto para montar o schema Zod de `card_field_values` no formulário do
 * card quanto em testes unitários — nenhuma dependência de banco.
 */
export function validateFieldValue(
  type: FieldType,
  value: unknown,
  options?: { required?: boolean; selectValues?: readonly string[] },
): { valid: boolean; error?: string } {
  const required = options?.required ?? false;
  const empty = isFieldValueEmpty(value);

  if (empty) {
    return required ? { valid: false, error: "Campo obrigatório." } : { valid: true };
  }

  switch (type) {
    case "short_text":
    case "long_text":
      return typeof value === "string" ? { valid: true } : { valid: false, error: "Valor inválido." };
    case "number":
    case "currency":
      return typeof value === "number" && Number.isFinite(value)
        ? { valid: true }
        : { valid: false, error: "Informe um número válido." };
    case "date":
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? { valid: true }
        : { valid: false, error: "Informe uma data válida." };
    case "checkbox":
      return typeof value === "boolean" ? { valid: true } : { valid: false, error: "Valor inválido." };
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? { valid: true }
        : { valid: false, error: "E-mail inválido." };
    case "phone":
      return typeof value === "string" && value.trim().length >= 8
        ? { valid: true }
        : { valid: false, error: "Telefone inválido." };
    case "user":
      return typeof value === "string" ? { valid: true } : { valid: false, error: "Usuário inválido." };
    case "attachment":
      return typeof value === "string" ? { valid: true } : { valid: false, error: "Anexo inválido." };
    case "single_select": {
      if (typeof value !== "string") return { valid: false, error: "Selecione uma opção." };
      if (options?.selectValues && !options.selectValues.includes(value)) {
        return { valid: false, error: "Opção inválida." };
      }
      return { valid: true };
    }
    case "multi_select": {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return { valid: false, error: "Selecione ao menos uma opção válida." };
      }
      if (options?.selectValues) {
        const allValid = value.every((v) => options.selectValues!.includes(v as string));
        if (!allValid) return { valid: false, error: "Opção inválida." };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: "Tipo de campo desconhecido." };
  }
}

/** Considera "vazio" os equivalentes usados também pelo `move_card()` SQL
 * (null, string vazia, array vazio) — mantém a mesma semântica dos dois
 * lados (banco e cliente) para não divergir sobre o que conta como
 * "campo obrigatório não preenchido". */
export function isFieldValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

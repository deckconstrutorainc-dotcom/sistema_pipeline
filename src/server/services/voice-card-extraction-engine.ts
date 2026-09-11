import { z } from "zod";

import { validateFieldValue, type FieldType } from "@/lib/validation/fields";
import type { OrganizationMemberOption } from "@/server/queries/organizations";

/**
 * Lógica PURA (sem I/O) da feature "Voz -> Card" (M8): parsing/validação do
 * JSON devolvido pelo Gemini, casamento de nome falado com membro da
 * organização, normalização de data e validação de campos customizados.
 *
 * Extraída num arquivo separado do orquestrador I/O
 * (`voice-card-extraction.ts`, que chama o `GeminiProvider` real e grava
 * `ai_runs`) especificamente para ser testável sem mockar Supabase/fetch —
 * mesmo padrão já usado por `ai-run-engine.ts` vs. `ai-run-processor.ts` e
 * `automation-engine.ts` vs. `automation-processor.ts`.
 */

export interface VoiceCardFieldSpec {
  id: string;
  fieldKey: string;
  label: string;
  type: FieldType;
  options: { value: string; label: string }[];
}

/** Schema tolerante do JSON esperado do Gemini — qualquer formato fora disso
 * é tratado como falha clara de extração (CLAUDE.md §3.15: nunca "adivinhar"
 * um valor a partir de uma resposta malformada). */
export const rawExtractionSchema = z.object({
  title: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  fields: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type RawExtraction = z.infer<typeof rawExtractionSchema>;

export interface ParsedExtraction {
  title: string | null;
  dueDate: string | null;
  assigneeName: string | null;
  fields: Record<string, unknown>;
}

/**
 * Remove cercas de bloco de código markdown (` ```json ... ``` `) que
 * modelos generativos frequentemente adicionam mesmo quando instruídos a
 * responder só com JSON — antes de tentar `JSON.parse`.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}

/**
 * Faz o parse do texto bruto retornado pelo provider de IA para o schema
 * estruturado esperado. Falha de forma explícita (nunca tenta "consertar"
 * ou adivinhar um JSON malformado) — CLAUDE.md §3.15.
 */
export function parseExtractionJson(rawContent: string): { success: true; data: RawExtraction } | { success: false; error: string } {
  const candidate = stripCodeFences(rawContent);

  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return { success: false, error: "A IA não retornou um JSON válido para extrair os dados do card." };
  }

  const parsed = rawExtractionSchema.safeParse(json);
  if (!parsed.success) {
    return { success: false, error: "O JSON retornado pela IA não tem o formato esperado (título/prazo/responsável/campos)." };
  }

  return { success: true, data: parsed.data };
}

/**
 * Normaliza uma data extraída (formato livre, idealmente "YYYY-MM-DD") para
 * ISO 8601 completo (compatível com `createCard`/`card_field_values`).
 * Retorna `null` quando a IA não extraiu uma data ou o valor não é uma data
 * válida — nunca lança, o formulário simplesmente fica sem prazo
 * pré-preenchido nesse caso (o humano revisa e preenche manualmente).
 */
export function normalizeDueDate(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString();
}

/**
 * Casa o nome falado (transcrito) do responsável com um membro da
 * organização por comparação simples de string (case-insensitive,
 * substring nos dois sentidos) — CLAUDE.md pede "similaridade de nome", não
 * fuzzy matching sofisticado (decisão documentada no relatório da tarefa).
 * Retorna `null` quando não há candidato (nome ausente, membro sem nome
 * cadastrado, ou nenhuma correspondência) — nunca "chuta" um responsável.
 */
export function matchAssigneeId(
  assigneeName: string | null | undefined,
  members: readonly OrganizationMemberOption[],
): string | null {
  const spoken = assigneeName?.trim().toLowerCase();
  if (!spoken) return null;

  for (const member of members) {
    const name = member.fullName?.trim().toLowerCase();
    if (!name) continue;
    if (name === spoken || name.includes(spoken) || spoken.includes(name)) {
      return member.id;
    }
  }

  return null;
}

/**
 * Valida cada valor de campo customizado extraído contra o tipo real do
 * campo do pipe (`validateFieldValue`, reaproveitado do formulário/servidor
 * de criação de card) — um valor que não bate com o tipo é DESCARTADO
 * individualmente (nunca falha a extração inteira por causa de um campo),
 * conforme decisão de arquitetura da tarefa. Chaves desconhecidas (que não
 * correspondem a nenhum `field_key` do pipe) também são descartadas.
 *
 * Retorna um mapa `fieldId -> valor` pronto para popular
 * `CreateCardForm`'s `fieldValues` state.
 */
export function buildValidatedFieldValues(
  rawFields: Record<string, unknown> | null | undefined,
  pipeFields: readonly VoiceCardFieldSpec[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!rawFields) return result;

  const fieldsByKey = new Map(pipeFields.map((field) => [field.fieldKey, field]));

  for (const [fieldKey, value] of Object.entries(rawFields)) {
    const field = fieldsByKey.get(fieldKey);
    if (!field) continue;

    const selectValues = field.options.map((option) => option.value);
    const validation = validateFieldValue(field.type, value, { selectValues });
    if (validation.valid && value !== null && value !== undefined) {
      result[field.id] = value;
    }
  }

  return result;
}

/**
 * Monta o system prompt enviado ao Gemini: instrução de transcrição +
 * extração estruturada em português, schema JSON esperado, lista de campos
 * do pipe (com opções quando for seleção) e lista de membros da organização
 * (para casar o nome falado do responsável).
 */
export function buildExtractionPrompt(
  pipeFields: readonly VoiceCardFieldSpec[],
  members: readonly OrganizationMemberOption[],
): string {
  const fieldsDescription = pipeFields.length
    ? pipeFields
        .map((field) => {
          const optionsText =
            field.options.length > 0
              ? ` (opções válidas: ${field.options.map((o) => `"${o.value}"`).join(", ")})`
              : "";
          return `- "${field.fieldKey}" (rótulo: "${field.label}", tipo: ${field.type})${optionsText}`;
        })
        .join("\n")
    : "(este pipe não tem campos customizados)";

  const membersDescription = members.length
    ? members.map((m) => `- ${m.fullName ?? "(sem nome cadastrado)"}`).join("\n")
    : "(nenhum membro cadastrado nesta organização)";

  return [
    "Você transcreve um áudio em português do Brasil e extrai dados estruturados para criar um card de gestão de processos.",
    "Ouça o áudio anexado, transcreva mentalmente o conteúdo e responda APENAS com um objeto JSON estrito, sem markdown, sem texto antes ou depois, no formato exato:",
    '{"title": "string ou null", "dueDate": "YYYY-MM-DD ou null", "assigneeName": "nome mencionado ou null", "fields": {"<field_key>": valor}}',
    "",
    "Regras:",
    "- \"title\": um título curto e descritivo para o card, com base no assunto principal falado.",
    "- \"dueDate\": data de prazo mencionada, no formato YYYY-MM-DD; use null se nenhum prazo foi mencionado. Nunca invente uma data.",
    "- \"assigneeName\": o nome de pessoa mencionado como responsável pela tarefa, exatamente como foi falado; use null se nenhum nome foi mencionado.",
    "- \"fields\": preencha SOMENTE as chaves de campo abaixo cujo valor você conseguiu identificar claramente no áudio; nunca invente um valor para um campo não mencionado.",
    "",
    "Campos customizados deste pipe (chave -> tipo):",
    fieldsDescription,
    "",
    "Membros da organização (para ajudar a reconhecer o nome do responsável mencionado, mas responda com o nome exatamente como foi falado, não escolha um nome da lista):",
    membersDescription,
  ].join("\n");
}

/**
 * M6 — Gestão e Analytics.
 *
 * `renderDocumentTemplate`: resolve os placeholders de um
 * `document_templates.body` contra os dados de um card, retornando o texto
 * final (HTML/texto simples — ver decisão de escopo documentada em
 * `supabase/migrations/20260818094000_documents.sql`: geração de PDF
 * binário real fica para iteração futura).
 *
 * Função PURA (sem I/O), testável sem DB/PDF — ver
 * `tests/unit/documents.test.ts`.
 *
 * Placeholders suportados, sintaxe `{{namespace.key}}`:
 *   - `card.title`, `card.number`, `card.dueDate`, `card.createdAt`
 *   - `field.<field_key>` — resolvido contra `fieldValuesByKey`
 *
 * Um placeholder não reconhecido/sem valor é substituído por uma string
 * vazia (nunca quebra a geração, nunca deixa `{{...}}` literal vazando pro
 * documento final) — decisão de UX: preferimos um documento com um "buraco"
 * silencioso a uma geração que falha inteira por causa de um único campo.
 */

export interface RenderCardData {
  title: string;
  number: number;
  dueDate: string | null;
  createdAt: string;
}

export interface RenderDocumentTemplateInput {
  body: string;
  card: RenderCardData;
  /** Mapa field_key -> valor já resolvido (string, number, boolean, etc). */
  fieldValuesByKey: Readonly<Record<string, unknown>>;
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function formatPlaceholderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map((v) => formatPlaceholderValue(v)).join(", ");
  if (value instanceof Date) return value.toLocaleString("pt-BR");
  return escapeHtml(String(value));
}

/** Escaping básico de HTML — o corpo do template é tratado como HTML nesta fase (ver decisão de escopo). */
function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveCardPlaceholder(key: string, card: RenderCardData): string | undefined {
  switch (key) {
    case "title":
      return escapeHtml(card.title);
    case "number":
      return String(card.number);
    case "dueDate":
      return card.dueDate ? new Date(card.dueDate).toLocaleDateString("pt-BR") : "";
    case "createdAt":
      return new Date(card.createdAt).toLocaleDateString("pt-BR");
    default:
      return undefined;
  }
}

/**
 * Resolve todos os placeholders `{{...}}` de `body` contra os dados do
 * card informado. Placeholders desconhecidos (namespace inválido, campo
 * inexistente) viram string vazia — nunca lançam exceção.
 */
export function renderDocumentTemplate(input: RenderDocumentTemplateInput): string {
  const { body, card, fieldValuesByKey } = input;

  return body.replace(PLACEHOLDER_PATTERN, (_match, rawKey: string) => {
    const [namespace, ...rest] = rawKey.split(".");
    const key = rest.join(".");

    if (namespace === "card") {
      return resolveCardPlaceholder(key, card) ?? "";
    }

    if (namespace === "field") {
      if (!key) return "";
      return formatPlaceholderValue(fieldValuesByKey[key]);
    }

    return "";
  });
}

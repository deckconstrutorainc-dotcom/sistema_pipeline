/**
 * Catálogo de METADADOS de tools de IA (CLAUDE.md §17) — nome, descrição e
 * nível de criticidade de cada tool disponível na plataforma.
 *
 * Deliberadamente SEM lógica de execução e SEM imports server-only (Zod à
 * parte, este módulo não importa `@/lib/supabase/admin` nem qualquer código
 * que dependa de `SUPABASE_SERVICE_ROLE_KEY`): é seguro importar deste
 * arquivo tanto de código server-only (`tool-registry.ts`, que agrega estes
 * metadados com o schema Zod + `execute()` reais) quanto de um componente
 * "use client" (ex.: os checkboxes de `allowed_tools` no formulário de
 * criação de agente) sem arriscar incluir credenciais/lógica de banco no
 * bundle do navegador.
 *
 * Fonte única de verdade para os NOMES de tool válidos — `allowed_tools`
 * (banco) e a validação Zod de `createAiAgentSchema`
 * (`src/lib/validation/ai.ts`) usam `TOOL_NAMES` derivado daqui.
 */

export type ToolCriticality = "read" | "write" | "critical";

export interface ToolCatalogEntry {
  name: string;
  description: string;
  criticality: ToolCriticality;
}

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  {
    name: "summarize_card",
    description:
      "Lê os dados atuais de um card (campos, fase, responsáveis, comentários) para o modelo gerar um resumo em texto. Não grava nada — nível 'read'.",
    criticality: "read",
  },
  {
    name: "search_records",
    description:
      "Busca registros em um database (M4) por texto, para dar contexto ao modelo (ex.: consultar um cadastro relacionado). Não grava nada — nível 'read'.",
    criticality: "read",
  },
  {
    name: "update_card_field",
    description:
      "Preenchimento assistido: atualiza o valor de UM campo de um card, reaproveitando a mesma validação de tipo de campo do M2. Nível 'write'.",
    criticality: "write",
  },
  {
    name: "suggest_label",
    description:
      "Classificação: aplica uma label existente do pipe a um card, com base no conteúdo. Nível 'write'.",
    criticality: "write",
  },
  {
    name: "extract_card_fields_from_document",
    description:
      "Extração de dados: a partir de um texto/documento, propõe valores para múltiplos campos de um card e registra a evidência (trecho-fonte) de cada valor extraído. Nível 'critical' — sobrescreve dados do card em lote, por isso sujeito a aprovação humana quando o agente exigir.",
    criticality: "critical",
  },
] as const;

export const TOOL_NAMES: readonly string[] = TOOL_CATALOG.map((t) => t.name);

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

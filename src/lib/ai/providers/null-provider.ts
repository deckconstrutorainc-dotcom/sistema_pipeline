import type { AIGenerateParams, AIGenerateResult, AIProvider } from "@/lib/ai/types";

/**
 * Stub de `AIProvider` para testes/desenvolvimento sem custo de API real —
 * mesmo padrão de `ConsoleNotificationProvider` (M3)/`ConsoleEmailProvider`
 * (M5): nunca chama uma API externa, apenas retorna uma resposta fixa,
 * sempre SEM tool_calls (nunca finge que o modelo pediu para executar uma
 * tool) e SEM custo (`costUsd: null`, `tokensUsed: 0`).
 *
 * NUNCA é retornado automaticamente por `getAIProvider()` como fallback
 * para uma `ANTHROPIC_API_KEY` ausente — isso violaria CLAUDE.md §3.15
 * ("não use dados mockados como implementação final"). Só é instanciado
 * explicitamente por quem sabe que está em um teste/ambiente de
 * desenvolvimento sem chave configurada.
 */
export class NullAIProvider implements AIProvider {
  readonly providerKey = "null" as const;

  async generate(params: AIGenerateParams): Promise<AIGenerateResult> {
    if (params.audio) {
      throw new Error(
        "NullAIProvider não suporta entrada de áudio (nunca finge uma transcrição). Use GeminiProvider para testar a feature Voz -> Card.",
      );
    }

    return {
      content: "[NullAIProvider] Nenhuma chamada de API real foi feita — provider de desenvolvimento/teste.",
      toolCalls: [],
      model: "null-provider",
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: null,
    };
  }
}

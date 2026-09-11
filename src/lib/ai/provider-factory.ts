import { AnthropicProvider } from "@/lib/ai/providers/anthropic-provider";
import type { AIProvider } from "@/lib/ai/types";

/**
 * Fábrica do `AIProvider` usado em produção pelo `ai-run-processor.ts`
 * (CLAUDE.md §17 "provider substituível"). Sempre retorna o provider REAL
 * (`AnthropicProvider`) — nunca cai para `NullAIProvider` automaticamente
 * quando a chave está ausente, o que seria simular uma resposta de IA
 * (CLAUDE.md §3.15). `AnthropicProvider.generate()` já lança um erro claro
 * nesse caso; é isso que deve acontecer, não um fallback silencioso.
 *
 * Trocar de provider no futuro (ex.: outro fornecedor de LLM) significa
 * mudar só esta função — nenhum outro arquivo do domínio conhece
 * `AnthropicProvider` diretamente.
 */
export function getAIProvider(): AIProvider {
  return new AnthropicProvider();
}

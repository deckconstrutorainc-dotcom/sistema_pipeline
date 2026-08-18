import Anthropic from "@anthropic-ai/sdk";

import type { AIGenerateParams, AIGenerateResult, AIProvider, ToolCallRequest } from "@/lib/ai/types";

/**
 * Implementação real de `AIProvider` usando a Messages API da Anthropic
 * (CLAUDE.md §17). Uso EXCLUSIVAMENTE server-side (server actions, route
 * handlers, services server-only) — nunca importar este módulo de um
 * componente "use client" — a chave (`ANTHROPIC_API_KEY`) só existe no
 * ambiente do servidor (ver `.env.example`). Mesma disciplina de uso
 * documentada em `src/lib/supabase/admin.ts`: a chave não tem prefixo
 * `NEXT_PUBLIC_*` e por isso não entra no bundle do navegador, mas a
 * responsabilidade de só importar este módulo a partir de código
 * server-only é de quem o importa.
 *
 * Se a chave não estiver configurada, `generate()` lança um erro explícito
 * — NUNCA simula uma resposta (CLAUDE.md §3.15 "não use dados mockados como
 * implementação final quando existir persistência real" aplicado aqui a
 * "nunca finja uma resposta de IA real"). Para desenvolvimento/testes sem
 * custo de API real, use `NullAIProvider` explicitamente — nunca como
 * fallback automático desta classe.
 */

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Tabela de preços USD por milhão de tokens, só para os modelos que este
 * provider efetivamente usa como default. PENDÊNCIA (documentada no
 * relatório final): mantida manualmente em sincronia com a tabela de preços
 * vigente da Anthropic — se o modelo default mudar ou a Anthropic reajustar
 * preços, esta tabela precisa ser atualizada manualmente; não há uma API de
 * preços consultável em runtime.
 */
const PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = PRICING_USD_PER_MILLION_TOKENS[model];
  if (!pricing) {
    return null;
  }
  const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  return Math.round(cost * 10000) / 10000;
}

export class AnthropicProvider implements AIProvider {
  readonly providerKey = "anthropic" as const;

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY não configurada no servidor. Necessária para executar um ai_run real " +
          "(ver .env.example) — a execução falha de forma explícita em vez de simular uma resposta.",
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generate(params: AIGenerateParams): Promise<AIGenerateResult> {
    const client = this.getClient();
    const model = params.model ?? DEFAULT_MODEL;

    const response = await client.messages.create({
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: params.systemPrompt,
      messages: params.messages.map((message) => ({ role: message.role, content: message.content })),
      tools: params.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        // `AIToolSpec.inputSchema` é um JSON Schema genérico
        // (`Record<string, unknown>`, ver `src/lib/ai/types.ts`) — cada tool
        // do registro já grava `type: "object"` nele (ver
        // `tool-registry.ts`), então o formato real sempre satisfaz
        // `Tool.InputSchema`; o cast só remove a checagem estrutural que o
        // TypeScript não consegue provar a partir de um tipo genérico.
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    const toolCalls: ToolCallRequest[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      } else if (block.type === "text") {
        textParts.push(block.text);
      }
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    return {
      content: textParts.join("\n").trim(),
      toolCalls,
      model: response.model,
      usage: { inputTokens, outputTokens },
      costUsd: estimateCostUsd(response.model, inputTokens, outputTokens),
    };
  }
}

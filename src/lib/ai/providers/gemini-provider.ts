import type { AIGenerateParams, AIGenerateResult, AIProvider } from "@/lib/ai/types";

/**
 * Implementação de `AIProvider` usando a API REST do Google Gemini
 * (CLAUDE.md §17 "provider substituível"). Usado EXCLUSIVAMENTE pela
 * feature "Voz -> Card" (`src/server/services/voice-card-extraction.ts`) —
 * NÃO é o provider padrão da camada de IA existente (M8 `ai_agents`/
 * `ai-run-processor.ts`), que continua usando `AnthropicProvider` via
 * `provider-factory.ts`. Este provider é escolhido explicitamente pelo
 * chamador quando precisa de entrada de áudio (`params.audio`), que a
 * Anthropic não suporta neste projeto.
 *
 * Chamado via `fetch` direto (sem SDK novo — a API REST do Gemini é simples
 * o bastante para não justificar uma dependência adicional, CLAUDE.md §3.21).
 * Uso EXCLUSIVAMENTE server-side — nunca importar de um componente
 * "use client": a chave (`GOOGLE_API_KEY`) só existe no ambiente do
 * servidor.
 *
 * Se a chave não estiver configurada, `generate()` lança um erro explícito —
 * NUNCA simula uma resposta/transcrição (mesmo princípio de
 * `AnthropicProvider`, CLAUDE.md §3.15).
 *
 * LIMITAÇÕES DESTA PRIMEIRA VERSÃO (documentadas, não implementadas):
 *   - Não suporta `params.tools` (tool-calling) — a feature de voz não usa
 *     o tool-registry existente. Chamar com `tools.length > 0` lança um
 *     erro explícito em vez de ignorar silenciosamente a lista.
 *   - `costUsd` sempre `null` — decisão deliberada de não manter uma tabela
 *     de preços do Gemini nesta primeira versão (ao contrário de
 *     `AnthropicProvider`, que mantém `PRICING_USD_PER_MILLION_TOKENS`).
 *     `tokens_used` ainda é gravado em `ai_runs` a partir de
 *     `usageMetadata`, então o dado bruto para calcular custo depois (se
 *     necessário) não se perde.
 *
 * MODELO DEFAULT (achado ao testar de ponta a ponta com a chave real do
 * projeto, ver relatório da tarefa): `gemini-2.5-flash` aparece listado em
 * `GET /v1beta/models`, mas a chamada real de `generateContent` retornou
 * `404 "This model ... is no longer available to new users"` — ou seja, a
 * disponibilidade real de um modelo Gemini não é confiável só pela listagem,
 * precisa ser validada com uma chamada de geração de verdade.
 * `gemini-flash-latest` (o alias "sempre o mais recente") retornou `503`
 * (alta demanda) no momento do teste. O único modelo que respondeu `200`
 * com um resultado coerente para esta chave foi `gemini-3.6-flash`, usado
 * como default abaixo. Reavalie este valor periodicamente — a Google
 * descontinua modelos Gemini com regularidade.
 */

const DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiCandidate {
  content?: { role?: string; parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  error?: { message?: string; status?: string };
}

export class GeminiProvider implements AIProvider {
  readonly providerKey = "gemini" as const;

  private getApiKey(): string {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_API_KEY não configurada no servidor. Necessária para a feature Voz -> Card (ver .env.example) " +
          "— a execução falha de forma explícita em vez de simular uma transcrição.",
      );
    }
    return apiKey;
  }

  async generate(params: AIGenerateParams): Promise<AIGenerateResult> {
    if (params.tools.length > 0) {
      throw new Error(
        "GeminiProvider não suporta tool-calling nesta versão (feature Voz -> Card não usa o tool-registry existente).",
      );
    }

    const apiKey = this.getApiKey();
    const model = params.model ?? DEFAULT_MODEL;

    const contents = params.messages.map((message) => {
      const parts: GeminiPart[] = [{ text: message.content }];
      return { role: message.role === "assistant" ? "model" : "user", parts };
    });

    if (params.audio) {
      const lastContent = contents[contents.length - 1];
      if (lastContent) {
        lastContent.parts.push({
          inlineData: { mimeType: params.audio.mimeType, data: params.audio.base64 },
        });
      } else {
        contents.push({
          role: "user",
          parts: [{ inlineData: { mimeType: params.audio.mimeType, data: params.audio.base64 } }],
        });
      }
    }

    const body = {
      systemInstruction: { role: "user", parts: [{ text: params.systemPrompt }] },
      contents,
    };

    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro de rede desconhecido.";
      throw new Error(`Falha ao chamar a API do Gemini: ${message}`);
    }

    let payload: GeminiGenerateContentResponse;
    try {
      payload = (await response.json()) as GeminiGenerateContentResponse;
    } catch {
      throw new Error(`Resposta inválida (não-JSON) da API do Gemini (status ${response.status}).`);
    }

    if (!response.ok) {
      const message = payload.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Erro da API do Gemini: ${message}`);
    }

    const candidate = payload.candidates?.[0];
    const textParts = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .filter((text) => text.length > 0);

    if (textParts.length === 0) {
      const finishReason = candidate?.finishReason ?? "desconhecido";
      throw new Error(`A API do Gemini não retornou conteúdo de texto (finishReason: ${finishReason}).`);
    }

    const inputTokens = payload.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      content: textParts.join("\n").trim(),
      toolCalls: [],
      model: payload.modelVersion ?? model,
      usage: { inputTokens, outputTokens },
      // Sem tabela de preços do Gemini mantida nesta versão — ver comentário
      // no topo do arquivo.
      costUsd: null,
    };
  }
}

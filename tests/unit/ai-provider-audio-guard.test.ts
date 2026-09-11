/**
 * `AIGenerateParams.audio` (feature "Voz -> Card", M8) só é suportado por
 * `GeminiProvider`. `AnthropicProvider`/`NullAIProvider` devem lançar um
 * erro explícito quando `params.audio` vier preenchido — nunca ignorar
 * silenciosamente um áudio que o chamador esperava que fosse processado
 * (CLAUDE.md §3.15/§17). Estes testes rodam sem `ANTHROPIC_API_KEY`
 * configurada: a checagem de áudio acontece ANTES de qualquer tentativa de
 * usar a chave/chamar a API.
 */
import { describe, expect, it } from "vitest";

import { AnthropicProvider } from "@/lib/ai/providers/anthropic-provider";
import { NullAIProvider } from "@/lib/ai/providers/null-provider";

describe("AnthropicProvider — guarda de entrada de áudio", () => {
  it("lança erro explícito quando params.audio vem preenchido", async () => {
    const provider = new AnthropicProvider();
    await expect(
      provider.generate({
        systemPrompt: "x",
        messages: [{ role: "user", content: "oi" }],
        tools: [],
        audio: { base64: "QUJD", mimeType: "audio/webm" },
      }),
    ).rejects.toThrow(/áudio/i);
  });
});

describe("NullAIProvider — guarda de entrada de áudio", () => {
  it("lança erro explícito quando params.audio vem preenchido (nunca finge uma transcrição)", async () => {
    const provider = new NullAIProvider();
    await expect(
      provider.generate({
        systemPrompt: "x",
        messages: [{ role: "user", content: "oi" }],
        tools: [],
        audio: { base64: "QUJD", mimeType: "audio/webm" },
      }),
    ).rejects.toThrow(/áudio/i);
  });

  it("continua funcionando normalmente sem áudio (comportamento existente preservado)", async () => {
    const provider = new NullAIProvider();
    const result = await provider.generate({
      systemPrompt: "x",
      messages: [{ role: "user", content: "oi" }],
      tools: [],
    });
    expect(result.content).toContain("NullAIProvider");
    expect(result.costUsd).toBeNull();
  });
});

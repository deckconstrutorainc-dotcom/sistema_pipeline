/**
 * Testes de `GeminiProvider` com `fetch` mockado (sem chamar a API real do
 * Gemini) — cobrem o mapeamento de request/response e o tratamento de erro.
 * A chamada real de ponta a ponta (áudio real -> Gemini -> JSON) foi
 * verificada separadamente via script (ver relatório da tarefa) porque
 * depende de uma chave de API real e não deve rodar em CI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeminiProvider } from "@/lib/ai/providers/gemini-provider";

const ORIGINAL_ENV = process.env.GOOGLE_API_KEY;

describe("GeminiProvider", () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.GOOGLE_API_KEY = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("lança erro claro quando GOOGLE_API_KEY não está configurada", async () => {
    delete process.env.GOOGLE_API_KEY;
    const provider = new GeminiProvider();
    await expect(
      provider.generate({ systemPrompt: "x", messages: [{ role: "user", content: "oi" }], tools: [] }),
    ).rejects.toThrow(/GOOGLE_API_KEY/);
  });

  it("lança erro quando params.tools vem preenchido (não suportado nesta versão)", async () => {
    const provider = new GeminiProvider();
    await expect(
      provider.generate({
        systemPrompt: "x",
        messages: [{ role: "user", content: "oi" }],
        tools: [{ name: "t", description: "d", inputSchema: {} }],
      }),
    ).rejects.toThrow(/tool-calling/);
  });

  it("monta o request com systemInstruction + inlineData de áudio e mapeia a resposta", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { role: "model", parts: [{ text: '{"title":"Card X"}' }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
        modelVersion: "gemini-2.5-flash",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider();
    const result = await provider.generate({
      systemPrompt: "Extraia dados.",
      messages: [{ role: "user", content: "Transcreva." }],
      tools: [],
      audio: { base64: "QUJD", mimeType: "audio/webm" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-3.6-flash:generateContent");
    expect(url).toContain("key=test-key");

    const body = JSON.parse(init.body as string) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[];
    };
    expect(body.systemInstruction.parts[0]?.text).toBe("Extraia dados.");
    expect(body.contents[0]?.parts.some((p) => p.inlineData?.mimeType === "audio/webm")).toBe(true);

    expect(result.content).toBe('{"title":"Card X"}');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(result.costUsd).toBeNull();
    expect(result.toolCalls).toEqual([]);
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("lança erro claro quando a API do Gemini responde com erro HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "API key inválida" } }),
      }),
    );

    const provider = new GeminiProvider();
    await expect(
      provider.generate({ systemPrompt: "x", messages: [{ role: "user", content: "oi" }], tools: [] }),
    ).rejects.toThrow(/API key inválida/);
  });

  it("lança erro claro quando a resposta não tem nenhuma parte de texto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] }),
      }),
    );

    const provider = new GeminiProvider();
    await expect(
      provider.generate({ systemPrompt: "x", messages: [{ role: "user", content: "oi" }], tools: [] }),
    ).rejects.toThrow(/SAFETY/);
  });
});

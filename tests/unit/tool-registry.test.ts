import { describe, expect, it } from "vitest";

import { TOOL_CATALOG } from "@/lib/ai/tool-catalog";
import { getToolDefinition, resolveAllowedTool, TOOL_REGISTRY } from "@/lib/ai/tool-registry";

describe("TOOL_REGISTRY — integridade do catálogo (CLAUDE.md §17)", () => {
  it("toda tool do catálogo tem uma implementação registrada", () => {
    expect(TOOL_REGISTRY).toHaveLength(TOOL_CATALOG.length);
  });

  it("toda tool tem schema Zod definido (parametersSchema com safeParse)", () => {
    for (const tool of TOOL_REGISTRY) {
      expect(typeof tool.parametersSchema.safeParse).toBe("function");
    }
  });

  it("toda tool tem JSON Schema de parâmetros definido", () => {
    for (const tool of TOOL_REGISTRY) {
      expect(tool.parametersJsonSchema).toBeTruthy();
      expect(tool.parametersJsonSchema.type).toBe("object");
    }
  });

  it("toda tool tem nível de criticidade definido dentre os valores válidos", () => {
    const validCriticalities = ["read", "write", "critical"];
    for (const tool of TOOL_REGISTRY) {
      expect(validCriticalities).toContain(tool.criticality);
    }
  });

  it("toda tool tem uma função execute()", () => {
    for (const tool of TOOL_REGISTRY) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("existe pelo menos uma tool de cada nível de criticidade (cobertura mínima do M8)", () => {
    const criticalities = new Set(TOOL_REGISTRY.map((t) => t.criticality));
    expect(criticalities.has("read")).toBe(true);
    expect(criticalities.has("write")).toBe(true);
    expect(criticalities.has("critical")).toBe(true);
  });
});

describe("getToolDefinition", () => {
  it("resolve uma tool existente pelo nome", () => {
    expect(getToolDefinition("summarize_card")).toBeDefined();
  });

  it("retorna undefined para uma tool inexistente", () => {
    expect(getToolDefinition("delete_organization")).toBeUndefined();
  });
});

describe("resolveAllowedTool — allowlist é respeitada (defesa central do M8)", () => {
  it("resolve a tool quando o nome está na allowlist", () => {
    const tool = resolveAllowedTool("summarize_card", ["summarize_card", "update_card_field"]);
    expect(tool).not.toBeNull();
    expect(tool?.name).toBe("summarize_card");
  });

  it("REJEITA (retorna null) uma tool que existe no registro mas NÃO está na allowlist do agente", () => {
    // update_card_field existe no registro (ver TOOL_REGISTRY acima), mas o
    // agente hipotético só autorizou summarize_card — a chamada nunca deve
    // ser executada.
    const tool = resolveAllowedTool("update_card_field", ["summarize_card"]);
    expect(tool).toBeNull();
  });

  it("retorna null para uma allowlist vazia, mesmo para uma tool 'read' inofensiva", () => {
    expect(resolveAllowedTool("summarize_card", [])).toBeNull();
  });

  it("retorna null para um nome de tool que não existe em lugar nenhum", () => {
    expect(resolveAllowedTool("drop_all_tables", ["drop_all_tables"])).toBeNull();
  });

  it("nunca resolve uma tool 'critical' fora da allowlist, mesmo com o nome correto", () => {
    const tool = resolveAllowedTool("extract_card_fields_from_document", ["summarize_card", "suggest_label"]);
    expect(tool).toBeNull();
  });
});

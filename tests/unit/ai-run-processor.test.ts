/**
 * Testes da lógica de DECISÃO do processamento de `ai_run` (CLAUDE.md §17).
 *
 * `ai-run-processor.ts` (a orquestração real: carregar agente, chamar o
 * provider, executar tools via client admin) depende de I/O (Supabase +
 * `AIProvider`) e por isso não é testável de forma unitária pura sem um
 * banco/mocking pesado — mesmo padrão já usado por `automation-processor.ts`
 * vs. `automation-engine.ts` no M3 (ver `tests/unit/automation-engine.test.ts`).
 * A lógica de decisão pura foi extraída para `ai-run-engine.ts`
 * especificamente para ser testável aqui sem chamar o provider real nem
 * qualquer client Supabase — nenhum destes testes faz I/O.
 */
import { describe, expect, it } from "vitest";

import {
  decideToolCallOutcome,
  selectRelevantKnowledge,
  type KnowledgeSourceForSearch,
} from "@/server/services/ai-run-engine";

describe("decideToolCallOutcome — human-in-the-loop (CLAUDE.md §17/§3.29)", () => {
  it("tool 'critical' + agente exige aprovação => awaiting_approval (NÃO executa)", () => {
    expect(decideToolCallOutcome("critical", true)).toBe("awaiting_approval");
  });

  it("tool 'critical' + agente NÃO exige aprovação => execute", () => {
    expect(decideToolCallOutcome("critical", false)).toBe("execute");
  });

  it("tool 'write' nunca fica retida, mesmo com requiresApproval=true", () => {
    expect(decideToolCallOutcome("write", true)).toBe("execute");
  });

  it("tool 'read' nunca fica retida, mesmo com requiresApproval=true", () => {
    expect(decideToolCallOutcome("read", true)).toBe("execute");
  });

  it("tool 'write'/'read' com requiresApproval=false também executa (comportamento padrão)", () => {
    expect(decideToolCallOutcome("write", false)).toBe("execute");
    expect(decideToolCallOutcome("read", false)).toBe("execute");
  });
});

describe("selectRelevantKnowledge — busca textual simples (não semântica)", () => {
  const sources: KnowledgeSourceForSearch[] = [
    { id: "1", name: "Política de contratos", content: "Todo contrato acima de R$ 50.000 exige aprovação jurídica." },
    { id: "2", name: "Política de EPIs", content: "Capacete e luvas são obrigatórios em obra." },
    { id: "3", name: "Fonte vazia", content: null },
    { id: "4", name: "Fonte em branco", content: "   " },
  ];

  it("retorna as fontes cujo conteúdo contém termos da consulta", () => {
    const matches = selectRelevantKnowledge(sources, "aprovação jurídica de contrato", 3);
    expect(matches.some((m) => m.id === "1")).toBe(true);
    expect(matches.some((m) => m.id === "2")).toBe(false);
  });

  it("ignora fontes sem conteúdo (null ou em branco)", () => {
    const matches = selectRelevantKnowledge(sources, "capacete luvas contrato", 10);
    expect(matches.some((m) => m.id === "3")).toBe(false);
    expect(matches.some((m) => m.id === "4")).toBe(false);
  });

  it("ordena por score decrescente (mais termos correspondentes primeiro)", () => {
    const matches = selectRelevantKnowledge(sources, "contrato aprovação jurídica capacete", 10);
    expect(matches[0]?.id).toBe("1");
  });

  it("respeita o limite informado", () => {
    const matches = selectRelevantKnowledge(sources, "contrato capacete", 1);
    expect(matches).toHaveLength(1);
  });

  it("retorna lista vazia quando a consulta é vazia/só espaços", () => {
    expect(selectRelevantKnowledge(sources, "   ", 3)).toEqual([]);
  });

  it("retorna lista vazia quando nenhuma fonte corresponde à consulta", () => {
    expect(selectRelevantKnowledge(sources, "termo-que-nao-existe-em-nenhum-lugar", 3)).toEqual([]);
  });

  it("o excerto retornado vem do conteúdo original da fonte", () => {
    const matches = selectRelevantKnowledge(sources, "capacete", 1);
    expect(matches[0]?.excerpt).toContain("Capacete");
  });
});

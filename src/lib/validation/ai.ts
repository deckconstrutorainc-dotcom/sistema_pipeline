import { z } from "zod";

import { TOOL_NAMES } from "@/lib/ai/tool-catalog";

const toolNameSet = new Set(TOOL_NAMES);

/** Valida que toda tool selecionada existe no catálogo (`tool-catalog.ts`)
 * — a allowlist gravada em `ai_agents.allowed_tools` nunca aceita um nome
 * de tool inexistente (CLAUDE.md §17 "ferramentas controladas pelo
 * servidor"). */
const allowedToolsSchema = z
  .array(z.string())
  .min(1, "Selecione ao menos uma tool.")
  .refine((tools) => tools.every((tool) => toolNameSet.has(tool)), {
    message: "Uma das tools selecionadas não existe no catálogo.",
  });

export const createAiAgentSchema = z.object({
  organizationId: z.string().uuid("Organização inválida."),
  name: z.string().trim().min(1, "Informe o nome do agente.").max(120),
  description: z.string().trim().max(500).optional(),
  instructions: z.string().trim().min(1, "Informe as instruções (system prompt) do agente.").max(8000),
  allowedTools: allowedToolsSchema,
  pipeId: z.string().uuid("Pipe inválido.").optional(),
  requiresApproval: z.boolean().default(true),
});
export type CreateAiAgentInput = z.infer<typeof createAiAgentSchema>;

export const updateAiAgentSchema = z.object({
  agentId: z.string().uuid("Agente inválido."),
  organizationId: z.string().uuid("Organização inválida."),
  name: z.string().trim().min(1, "Informe o nome do agente.").max(120).optional(),
  description: z.string().trim().max(500).optional(),
  instructions: z.string().trim().min(1).max(8000).optional(),
  allowedTools: allowedToolsSchema.optional(),
  pipeId: z.string().uuid("Pipe inválido.").nullable().optional(),
  requiresApproval: z.boolean().optional(),
});
export type UpdateAiAgentInput = z.infer<typeof updateAiAgentSchema>;

export const toggleAiAgentSchema = z.object({
  agentId: z.string().uuid("Agente inválido."),
  organizationId: z.string().uuid("Organização inválida."),
  isActive: z.boolean(),
});
export type ToggleAiAgentInput = z.infer<typeof toggleAiAgentSchema>;

/** Disparo manual de um `ai_run` — "assistente de card" (CLAUDE.md §22 M8). */
export const triggerAiRunSchema = z.object({
  agentId: z.string().uuid("Agente inválido."),
  cardId: z.string().uuid("Card inválido.").optional(),
  instruction: z.string().trim().min(1, "Descreva o que a IA deve fazer.").max(4000),
});
export type TriggerAiRunInput = z.infer<typeof triggerAiRunSchema>;

/** Aprovação/rejeição humana de uma run crítica (CLAUDE.md §17/§3.29). */
export const approveAiRunSchema = z.object({
  runId: z.string().uuid("Execução inválida."),
  approve: z.boolean(),
});
export type ApproveAiRunInput = z.infer<typeof approveAiRunSchema>;

export const knowledgeSourceTypes = ["document", "url", "database_table", "manual_text"] as const;
export type KnowledgeSourceType = (typeof knowledgeSourceTypes)[number];

export const createKnowledgeSourceSchema = z
  .object({
    organizationId: z.string().uuid("Organização inválida."),
    aiAgentId: z.string().uuid("Agente inválido.").optional(),
    name: z.string().trim().min(1, "Informe o nome da fonte.").max(160),
    sourceType: z.enum(knowledgeSourceTypes),
    content: z.string().trim().max(20000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "manual_text" && !data.content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o texto da fonte de conhecimento.",
        path: ["content"],
      });
    }
  });
export type CreateKnowledgeSourceInput = z.infer<typeof createKnowledgeSourceSchema>;

export const deleteKnowledgeSourceSchema = z.object({
  knowledgeSourceId: z.string().uuid("Fonte inválida."),
  organizationId: z.string().uuid("Organização inválida."),
});
export type DeleteKnowledgeSourceInput = z.infer<typeof deleteKnowledgeSourceSchema>;

import { z } from "zod";

export const addChecklistItemSchema = z.object({
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  title: z.string().trim().min(1, "Informe o texto do item.").max(300, "Texto muito longo."),
});
export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;

export const toggleChecklistItemSchema = z.object({
  itemId: z.string().uuid("Item inválido."),
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  isDone: z.boolean(),
});
export type ToggleChecklistItemInput = z.infer<typeof toggleChecklistItemSchema>;

export const updateChecklistItemTitleSchema = z.object({
  itemId: z.string().uuid("Item inválido."),
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
  title: z.string().trim().min(1, "Informe o texto do item.").max(300, "Texto muito longo."),
});
export type UpdateChecklistItemTitleInput = z.infer<typeof updateChecklistItemTitleSchema>;

export const deleteChecklistItemSchema = z.object({
  itemId: z.string().uuid("Item inválido."),
  cardId: z.string().uuid("Card inválido."),
  pipeId: z.string().uuid("Pipe inválido."),
});
export type DeleteChecklistItemInput = z.infer<typeof deleteChecklistItemSchema>;

/**
 * Calcula o progresso (concluídos / total) de uma lista de itens de
 * checklist — lógica pura, reutilizada tanto no resumo do card no Kanban
 * quanto na aba Checklist da página de detalhe.
 */
export function getChecklistProgress(items: readonly { isDone: boolean }[]): {
  done: number;
  total: number;
} {
  return {
    done: items.filter((item) => item.isDone).length,
    total: items.length,
  };
}

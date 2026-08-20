import { getChecklistProgress } from "@/lib/validation/checklists";
import { listChecklistItems } from "@/server/queries/cards";
import { AddChecklistItemForm } from "@/components/forms/add-checklist-item-form";
import { ChecklistItemRow } from "@/components/cards/checklist-item-row";

interface ChecklistSectionProps {
  cardId: string;
  pipeId: string;
}

/**
 * Aba Checklist da página de detalhe do card (M2 — checklist de card,
 * nova funcionalidade). Server Component: carrega os itens diretamente da
 * query e delega a interatividade (marcar/renomear/excluir) para
 * componentes client menores, mesmo padrão de `CardConnectionsSection`.
 */
export async function ChecklistSection({ cardId, pipeId }: ChecklistSectionProps) {
  const items = await listChecklistItems(cardId);
  const { done, total } = getChecklistProgress(items);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Checklist</h2>
        {total > 0 ? (
          <span className="text-xs text-muted-foreground">
            {done}/{total} concluídos
          </span>
        ) : null}
      </div>

      {total > 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item no checklist ainda.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              itemId={item.id}
              cardId={cardId}
              pipeId={pipeId}
              title={item.title}
              isDone={item.isDone}
            />
          ))}
        </ul>
      )}

      <AddChecklistItemForm cardId={cardId} pipeId={pipeId} />
    </section>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDueStatus } from "@/lib/validation/cards";
import type { CardSummary, LabelSummary, PhaseSummary } from "@/server/queries/pipes";

interface CardsListTableProps {
  pipeId: string;
  cards: CardSummary[];
  phases: PhaseSummary[];
  labels: LabelSummary[];
}

type SortField = "number" | "title" | "phase" | "dueDate" | "createdAt";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 20;

/**
 * Visão em lista (tabela) de todos os cards do pipe — aba "Lista" do
 * layout de abas do pipe (CLAUDE.md §12: kanban não é a única forma de
 * enxergar o mesmo workflow). Ordenável por coluna, com paginação simples
 * no cliente — os dados já vêm carregados de `getPipeBoardData` (mesma
 * fonte usada pelo Kanban), sem duplicar consulta ao banco.
 */
export function CardsListTable({ pipeId, cards, phases, labels }: CardsListTableProps) {
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(0);

  const phasesById = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases]);
  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const sorted = useMemo(() => {
    const copy = [...cards];
    copy.sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case "number":
          diff = a.number - b.number;
          break;
        case "title":
          diff = a.title.localeCompare(b.title, "pt-BR");
          break;
        case "phase":
          diff = (phasesById.get(a.currentPhaseId)?.name ?? "").localeCompare(
            phasesById.get(b.currentPhaseId)?.name ?? "",
            "pt-BR",
          );
          break;
        case "dueDate":
          diff = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
          break;
        case "createdAt":
          diff = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDirection === "asc" ? diff : -diff;
    });
    return copy;
  }, [cards, sortField, sortDirection, phasesById]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(0);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (field !== sortField) return <ArrowUpDown className="size-3 opacity-40" aria-hidden />;
    return sortDirection === "asc" ? (
      <ArrowUp className="size-3" aria-hidden />
    ) : (
      <ArrowDown className="size-3" aria-hidden />
    );
  }

  function SortableHeader({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <th className="px-3 py-2 font-medium">
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className="flex items-center gap-1 hover:text-foreground"
        >
          {children}
          <SortIcon field={field} />
        </button>
      </th>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Nenhum card neste pipe ainda.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <SortableHeader field="number">Número</SortableHeader>
              <SortableHeader field="title">Título</SortableHeader>
              <SortableHeader field="phase">Fase</SortableHeader>
              <th className="px-3 py-2 font-medium">Responsáveis</th>
              <th className="px-3 py-2 font-medium">Labels</th>
              <SortableHeader field="dueDate">Prazo</SortableHeader>
              <SortableHeader field="createdAt">Criado em</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((card) => {
              const phase = phasesById.get(card.currentPhaseId);
              const dueStatus = getDueStatus(card.dueDate);
              return (
                <tr key={card.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">#{card.number}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/pipes/${pipeId}/cards/${card.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {card.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      {phase?.color ? (
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: phase.color }}
                          aria-hidden
                        />
                      ) : null}
                      {phase?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {card.assignees.length === 0
                      ? "—"
                      : card.assignees.map((a) => a.fullName ?? "Sem nome").join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    {card.labelIds.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {card.labelIds.map((labelId) => {
                          const label = labelsById.get(labelId);
                          if (!label) return null;
                          return (
                            <span
                              key={labelId}
                              className="rounded-full px-2 py-0.5 text-xs text-white"
                              style={{ backgroundColor: label.color }}
                            >
                              {label.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {card.dueDate ? (
                      <span
                        className={cn(
                          "text-muted-foreground",
                          dueStatus === "overdue" && "font-medium text-destructive",
                        )}
                      >
                        {new Date(card.dueDate).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {dueStatus === "overdue" ? (
                      <Badge variant="destructive" className="ml-2">
                        Atrasado
                      </Badge>
                    ) : dueStatus === "due_soon" ? (
                      <Badge variant="warning" className="ml-2">
                        Vence em breve
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(card.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {currentPage + 1} de {totalPages} ({sorted.length} cards)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-md border px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="rounded-md border px-2 py-1 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

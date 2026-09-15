"use client";

import { Check, Filter, Search, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CardSummary, LabelSummary } from "@/server/queries/pipes";

export type DueFilter = "all" | "overdue" | "due_soon" | "no_date";

export interface BoardFilters {
  query: string;
  labelIds: string[];
  assigneeIds: string[];
  due: DueFilter;
  onlyMine: boolean;
}

export const EMPTY_FILTERS: BoardFilters = {
  query: "",
  labelIds: [],
  assigneeIds: [],
  due: "all",
  onlyMine: false,
};

const dueOptions: { value: DueFilter; label: string }[] = [
  { value: "all", label: "Qualquer prazo" },
  { value: "overdue", label: "Atrasadas" },
  { value: "due_soon", label: "Vencem em breve" },
  { value: "no_date", label: "Sem prazo" },
];

export function countActiveFilters(filters: BoardFilters): number {
  return (
    (filters.labelIds.length > 0 ? 1 : 0) +
    (filters.assigneeIds.length > 0 ? 1 : 0) +
    (filters.due !== "all" ? 1 : 0) +
    (filters.onlyMine ? 1 : 0)
  );
}

/**
 * Busca e filtros do quadro.
 *
 * Filtragem no cliente, sobre os cards que `getPipeBoardData` já carregou —
 * nenhuma consulta nova ao banco. Funciona bem na escala de um processo
 * setorial; se um pipe passar de algumas centenas de atividades, a
 * paginação por fase é que precisa vir antes.
 */
export function BoardToolbar({
  filters,
  onChange,
  labels,
  people,
  total,
  visible,
  currentUserId,
}: {
  filters: BoardFilters;
  onChange: (next: BoardFilters) => void;
  labels: LabelSummary[];
  people: { id: string; fullName: string | null }[];
  total: number;
  visible: number;
  currentUserId: string | null;
}) {
  const activeCount = countActiveFilters(filters);
  const isFiltered = activeCount > 0 || filters.query.trim().length > 0;

  function toggleInList(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Buscar por título ou número…"
          className="pl-8"
          aria-label="Buscar atividades"
        />
        {filters.query ? (
          <button
            type="button"
            onClick={() => onChange({ ...filters, query: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Limpar busca"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {currentUserId ? (
        <Button
          variant={filters.onlyMine ? "default" : "outline"}
          size="sm"
          onClick={() => onChange({ ...filters, onlyMine: !filters.onlyMine })}
        >
          Minhas
        </Button>
      ) : null}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant={activeCount > 0 ? "secondary" : "outline"} size="sm">
            <Filter className="size-3.5" aria-hidden />
            Filtros
            {activeCount > 0 ? (
              <span className="tabular ml-0.5 rounded bg-primary px-1 text-ui-2xs font-semibold text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-64 p-0" align="end">
          <div className="max-h-[70vh] overflow-y-auto">
            <section className="border-b p-2">
              <p className="px-1 pb-1 text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prazo
              </p>
              {dueOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange({ ...filters, due: option.value })}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-ui-sm transition-colors hover:bg-accent"
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {filters.due === option.value ? <Check className="size-3.5" aria-hidden /> : null}
                  </span>
                  {option.label}
                </button>
              ))}
            </section>

            {labels.length > 0 ? (
              <section className="border-b p-2">
                <p className="px-1 pb-1 text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Etiquetas
                </p>
                {labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() =>
                      onChange({ ...filters, labelIds: toggleInList(filters.labelIds, label.id) })
                    }
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-ui-sm transition-colors hover:bg-accent"
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      {filters.labelIds.includes(label.id) ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : null}
                    </span>
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: label.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  </button>
                ))}
              </section>
            ) : null}

            {people.length > 0 ? (
              <section className="p-2">
                <p className="px-1 pb-1 text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Responsável
                </p>
                {people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...filters,
                        assigneeIds: toggleInList(filters.assigneeIds, person.id),
                      })
                    }
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-ui-sm transition-colors hover:bg-accent"
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      {filters.assigneeIds.includes(person.id) ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : null}
                    </span>
                    <Avatar name={person.fullName} seed={person.id} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {person.fullName ?? "Sem nome"}
                    </span>
                  </button>
                ))}
              </section>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {isFiltered ? (
        <>
          <span className="tabular text-ui-xs text-muted-foreground">
            {visible} de {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            <X className="size-3.5" aria-hidden />
            Limpar
          </Button>
        </>
      ) : (
        <span className={cn("tabular text-ui-xs text-muted-foreground")}>
          {total} {total === 1 ? "atividade" : "atividades"}
        </span>
      )}
    </div>
  );
}

/** Aplica os filtros a uma lista de cards. Puro, para poder ser testado. */
export function applyBoardFilters(
  cards: CardSummary[],
  filters: BoardFilters,
  currentUserId: string | null,
  now: Date = new Date(),
): CardSummary[] {
  const query = filters.query.trim().toLowerCase();
  // "#142" e "142" devem achar o card 142.
  const queryNumber = Number.parseInt(query.replace(/^#/, ""), 10);

  return cards.filter((card) => {
    if (query) {
      const matchesTitle = card.title.toLowerCase().includes(query);
      const matchesNumber = !Number.isNaN(queryNumber) && card.number === queryNumber;
      if (!matchesTitle && !matchesNumber) return false;
    }

    if (filters.onlyMine && currentUserId) {
      if (!card.assignees.some((a) => a.id === currentUserId)) return false;
    }

    if (filters.labelIds.length > 0) {
      if (!filters.labelIds.some((id) => card.labelIds.includes(id))) return false;
    }

    if (filters.assigneeIds.length > 0) {
      if (!filters.assigneeIds.some((id) => card.assignees.some((a) => a.id === id))) return false;
    }

    if (filters.due !== "all") {
      const due = card.dueDate ? new Date(card.dueDate) : null;

      if (filters.due === "no_date") return due === null;
      if (!due) return false;

      const hoursLeft = (due.getTime() - now.getTime()) / 3_600_000;
      if (filters.due === "overdue" && hoursLeft >= 0) return false;
      // "Vence em breve" é a janela de 48h à frente — atrasadas têm filtro
      // próprio e não devem aparecer aqui.
      if (filters.due === "due_soon" && (hoursLeft < 0 || hoursLeft > 48)) return false;
    }

    return true;
  });
}

import Link from "next/link";

import { TaskStatusSelect } from "@/components/forms/task-status-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { hasOrgRole, requireActiveOrganization } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { getDueStatus, type DueStatus } from "@/lib/validation/cards";
import { getDashboardData, type MyCardItem, type MyTaskItem } from "@/server/queries/dashboard";

const taskStatusLabels: Record<MyTaskItem["status"], string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  done: "Concluída",
  cancelled: "Cancelada",
};

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Badge de prazo — reaproveita `getDueStatus`, sem lógica de data própria. */
function DueBadge({ dueDate }: { dueDate: string | null }) {
  const status: DueStatus = getDueStatus(dueDate);
  const formatted = formatDueDate(dueDate);

  if (status === "overdue") {
    return <Badge variant="destructive">Atrasada{formatted ? ` · ${formatted}` : ""}</Badge>;
  }
  if (status === "due_soon") {
    return <Badge variant="warning">Vence em breve{formatted ? ` · ${formatted}` : ""}</Badge>;
  }
  if (status === "on_time" && formatted) {
    return <Badge variant="secondary">Prazo {formatted}</Badge>;
  }
  return <span className="text-xs text-muted-foreground">Sem prazo</span>;
}

function KpiCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: number;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums leading-none",
            emphasis && value > 0 && "text-destructive",
          )}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function MyTaskRow({ task }: { task: MyTaskItem }) {
  const cardHref =
    task.pipeId && task.cardId ? `/pipes/${task.pipeId}/cards/${task.cardId}` : null;

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{task.title}</p>
        {task.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <DueBadge dueDate={task.dueDate} />
          <Badge variant="outline">{taskStatusLabels[task.status]}</Badge>
          {cardHref ? (
            <Link href={cardHref} className="text-xs text-primary underline-offset-4 hover:underline">
              #{task.cardNumber} {task.cardTitle}
            </Link>
          ) : task.pipeId ? (
            <Link
              href={`/pipes/${task.pipeId}`}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              {task.pipeName ?? "Ver pipe"}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">
        <TaskStatusSelect taskId={task.id} status={task.status} />
      </div>
    </li>
  );
}

function MyCardRow({ card }: { card: MyCardItem }) {
  return (
    <li className="rounded-lg border p-4">
      <Link href={`/pipes/${card.pipeId}/cards/${card.id}`} className="block space-y-1">
        <p className="font-medium">
          <span className="text-muted-foreground">#{card.number}</span> {card.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{card.pipeName}</span>
          {card.phaseName ? <Badge variant="secondary">{card.phaseName}</Badge> : null}
          {card.isDone ? <Badge variant="success">Concluído</Badge> : null}
          <DueBadge dueDate={card.dueDate} />
        </div>
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const organization = await requireActiveOrganization();
  const canManageOrganization = await hasOrgRole(organization.id, ["super_admin", "admin"]);
  const data = await getDashboardData(organization.id, canManageOrganization);

  const completionPercent =
    data.orgOverview?.completion.rate === null || data.orgOverview === null
      ? null
      : Math.round(data.orgOverview.completion.rate * 100);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Suas pendências em <strong>{organization.name}</strong>.
        </p>
      </div>

      {data.hasLoadError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Não foi possível carregar parte das informações do dashboard. Os números abaixo podem
          estar incompletos — recarregue a página para tentar novamente.
        </div>
      ) : null}

      {/* KPIs */}
      <section aria-label="Resumo" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tarefas abertas"
          value={data.kpis.openTasks}
          hint="Atribuídas a você e não concluídas"
        />
        <KpiCard
          label="Tarefas atrasadas"
          value={data.kpis.overdueTasks}
          hint="Passaram do prazo"
          emphasis
        />
        <KpiCard
          label="Meus cards"
          value={data.kpis.myCards}
          hint="Cards ativos com você como responsável"
        />
        <KpiCard
          label="Cards atrasados"
          value={data.kpis.overdueCards}
          hint="Seus cards fora do prazo"
          emphasis
        />
      </section>

      {/* Minhas tarefas */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Minhas tarefas</h2>
          <Link
            href="/tasks"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Ver todas as tarefas
          </Link>
        </div>
        {data.myTasks.length === 0 ? (
          <EmptyState>
            <p>Nenhuma tarefa atribuída a você.</p>
            <p>
              Quando alguém criar uma tarefa e te definir como responsável, ela aparece aqui,
              ordenada por prazo.
            </p>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.myTasks.map((task) => (
              <MyTaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </section>

      {/* Meus cards */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Meus cards</h2>
          {data.myCardsTotal > data.myCards.length ? (
            <Link href="/pipes" className="text-sm text-primary underline-offset-4 hover:underline">
              Ver todos ({data.myCardsTotal})
            </Link>
          ) : null}
        </div>
        {data.myCards.length === 0 ? (
          <EmptyState>
            <p>Você ainda não é responsável por nenhum card ativo.</p>
            <p>
              Abra um pipe e atribua um card a você para acompanhá-lo aqui.{" "}
              <Link href="/pipes" className="text-primary underline-offset-4 hover:underline">
                Ver pipes
              </Link>
            </p>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {data.myCards.map((card) => (
              <MyCardRow key={card.id} card={card} />
            ))}
          </ul>
        )}
      </section>

      {/* Visão de gestão — apenas admin/super_admin */}
      {data.orgOverview ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Visão da organização</h2>
              <p className="text-sm text-muted-foreground">
                Visível para administradores de {organization.name}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/pipes" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Criar pipe
              </Link>
              <Link
                href="/reports"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Ver relatórios
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Cards ativos"
              value={data.orgOverview.sla.total}
              hint="Não arquivados, em todos os pipes"
            />
            <KpiCard
              label="Cards atrasados"
              value={data.orgOverview.sla.overdue}
              hint="Prazo do card já vencido"
              emphasis
            />
            <KpiCard
              label="SLA excedido"
              value={data.orgOverview.sla.slaExceeded}
              hint="Tempo na fase atual acima do SLA"
              emphasis
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground">Taxa de conclusão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-3xl font-semibold tabular-nums leading-none">
                  {completionPercent === null ? "—" : `${completionPercent}%`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {completionPercent === null
                    ? "Sem cards ativos para calcular."
                    : `${data.orgOverview.completion.completed} de ${data.orgOverview.completion.total} cards concluídos`}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cards ativos por pipe</CardTitle>
            </CardHeader>
            <CardContent>
              {data.orgOverview.pipeCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum pipe ativo nesta organização. Crie o primeiro pipe para começar a
                  acompanhar processos.
                </p>
              ) : (
                <ul className="divide-y">
                  {data.orgOverview.pipeCounts.map((entry) => (
                    <li key={entry.pipeId} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        href={`/pipes/${entry.pipeId}`}
                        className="truncate text-sm hover:underline"
                      >
                        {entry.pipeName}
                      </Link>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {entry.activeCards}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

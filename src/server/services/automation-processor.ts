import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationProvider } from "@/lib/notifications/provider";
import type { AutomationCondition, CardSnapshot } from "@/server/services/automation-engine";
import { evaluateConditions, resolveActions, type AutomationAction } from "@/server/services/automation-engine";

/**
 * Processamento server-side de uma `automation_run` (CLAUDE.md §11).
 *
 * Roda EXCLUSIVAMENTE com o client admin (`SUPABASE_SERVICE_ROLE_KEY`,
 * `server-only` — nunca importável do browser), chamado apenas por
 * `POST /api/automations/process` (protegido por `CRON_SECRET`). Nunca é
 * exposto como server action chamável diretamente pelo client autenticado.
 *
 * Reaproveita a MESMA RPC de movimentação usada pelo usuário (M2), via
 * `move_card_internal` (a variante interna de `move_card`, liberada apenas
 * para `service_role` — ver `20260818091800_move_card_domain_events.sql`),
 * e as mesmas tabelas que os server actions de M2 escrevem
 * (`card_field_values`, `card_assignments`, `card_labels`) — nenhuma regra
 * de negócio de M2 é duplicada aqui.
 *
 * Idempotência (CLAUDE.md §11 "reprocessamento seguro"):
 *   1. Curto-circuito: se a run já está 'succeeded' ou 'skipped', retorna
 *      sem executar nada de novo — reprocessar uma run finalizada nunca
 *      duplica efeito.
 *   2. Cada ação individual também é idempotente por si só: `update_field`
 *      usa upsert (reaplicar o mesmo valor é inofensivo); `assign_user`/
 *      `add_label` toleram violação de unicidade (23505) como sucesso, não
 *      como erro; `move_card` é natural: se o card já está na fase alvo, a
 *      2ª camada de prevenção de loop (`resolveActions`) já marca a ação
 *      como "skip" antes de sequer tentar.
 *   Isso significa que mesmo se o processo cair NO MEIO da execução de uma
 *   run (deixando-a 'running' ou reenfileirada como 'pending' após falha),
 *   reprocessá-la do zero não produz um efeito duplicado indevido.
 *
 * Retries: em caso de falha de uma ação, se `attempt < max_attempts`, a run
 * volta para 'pending' com `attempt` incrementado — SEM reprocessar
 * imediatamente (quem decide quando chamar de novo é o worker externo, via
 * `/api/automations/process` — ver `jobs.sql` sobre a ausência de cron
 * real). Ao esgotar as tentativas, a run é marcada 'failed' definitivamente.
 */

interface AutomationRow {
  id: string;
  pipe_id: string;
  is_active: boolean;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  created_by: string;
}

interface DomainEventRow {
  id: string;
  entity_id: string;
  payload: Record<string, unknown>;
}

interface AutomationRunRow {
  id: string;
  automation_id: string;
  domain_event_id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  attempt: number;
  max_attempts: number;
  automations: AutomationRow | null;
  domain_events: DomainEventRow | null;
}

interface CardRow {
  id: string;
  pipe_id: string;
  current_phase_id: string;
  title: string;
  due_date: string | null;
  is_archived: boolean;
  is_done: boolean;
}

export interface ProcessRunResult {
  runId: string;
  status: "succeeded" | "failed" | "skipped" | "pending" | "running";
  error?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function logAutomationActivity(
  admin: AdminClient,
  cardId: string,
  actorId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Insert direto (não via RPC log_card_activity, que exige auth.uid() de
  // sessão de usuário — ver comentário em move_card_domain_events.sql
  // sobre por que a automação roda via service role sem sessão). O
  // service role faz bypass de RLS, então o insert funciona mesmo sem
  // policy de INSERT em card_activities (mesmo padrão de escrita
  // "somente via privilégio elevado" já usado pelas funções SECURITY
  // DEFINER de M2).
  await admin.from("card_activities").insert({
    card_id: cardId,
    actor_id: actorId,
    type,
    payload,
  });
}

async function executeAction(
  admin: AdminClient,
  action: AutomationAction,
  ctx: { cardId: string; actorId: string; causationEventId: string },
): Promise<void> {
  switch (action.type) {
    case "move_card": {
      const targetPhaseId = action.params?.["targetPhaseId"];
      if (typeof targetPhaseId !== "string") {
        throw new Error("Ação move_card sem targetPhaseId configurado.");
      }
      const { error } = await admin.rpc("move_card_internal", {
        p_card_id: ctx.cardId,
        p_target_phase_id: targetPhaseId,
        p_actor_id: ctx.actorId,
        p_require_membership: false,
        p_causation_event_id: ctx.causationEventId,
      });
      if (error) throw new Error(error.message);
      return;
    }
    case "update_field": {
      const fieldId = action.params?.["fieldId"];
      if (typeof fieldId !== "string") {
        throw new Error("Ação update_field sem fieldId configurado.");
      }
      const value = action.params?.["value"] ?? null;
      const { error } = await admin.from("card_field_values").upsert(
        { card_id: ctx.cardId, field_id: fieldId, value, updated_by: ctx.actorId },
        { onConflict: "card_id,field_id" },
      );
      if (error) throw new Error(error.message);
      await logAutomationActivity(admin, ctx.cardId, ctx.actorId, "field_updated", {
        field_ids: [fieldId],
        via: "automation",
      });
      return;
    }
    case "assign_user": {
      const userId = action.params?.["userId"];
      if (typeof userId !== "string") {
        throw new Error("Ação assign_user sem userId configurado.");
      }
      const { error } = await admin
        .from("card_assignments")
        .insert({ card_id: ctx.cardId, user_id: userId, assigned_by: ctx.actorId });
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) {
        await logAutomationActivity(admin, ctx.cardId, ctx.actorId, "assigned", {
          user_id: userId,
          via: "automation",
        });
      }
      return;
    }
    case "add_label": {
      const labelId = action.params?.["labelId"];
      if (typeof labelId !== "string") {
        throw new Error("Ação add_label sem labelId configurado.");
      }
      const { error } = await admin.from("card_labels").insert({ card_id: ctx.cardId, label_id: labelId });
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) {
        await logAutomationActivity(admin, ctx.cardId, ctx.actorId, "label_added", {
          label_id: labelId,
          via: "automation",
        });
      }
      return;
    }
    case "send_notification": {
      const message = action.params?.["message"];
      const userIds = action.params?.["userIds"];
      await getNotificationProvider().send({
        cardId: ctx.cardId,
        message: typeof message === "string" ? message : "Automação disparada.",
        userIds: Array.isArray(userIds) ? (userIds as string[]) : undefined,
      });
      await logAutomationActivity(admin, ctx.cardId, ctx.actorId, "automation_action", {
        action: "send_notification",
        message,
      });
      return;
    }
    default:
      throw new Error(`Tipo de ação desconhecido: ${(action as AutomationAction).type}`);
  }
}

export async function processAutomationRun(runId: string): Promise<ProcessRunResult> {
  const admin = createAdminClient();

  const { data: run, error: runError } = await admin
    .from("automation_runs")
    .select(
      "id, automation_id, domain_event_id, status, attempt, max_attempts, " +
        "automations(id, pipe_id, is_active, conditions, actions, created_by), " +
        "domain_events(id, entity_id, payload)",
    )
    .eq("id", runId)
    .maybeSingle<AutomationRunRow>();

  if (runError || !run) {
    return { runId, status: "failed", error: "automation_run não encontrada." };
  }

  // Idempotência: reprocessar uma run já finalizada não reexecuta ações.
  if (run.status === "succeeded" || run.status === "skipped") {
    return { runId, status: run.status };
  }

  const automation = run.automations;
  const domainEvent = run.domain_events;
  if (!automation || !domainEvent) {
    await admin
      .from("automation_runs")
      .update({ status: "failed", error_message: "Automação ou evento de origem não encontrados.", finished_at: new Date().toISOString() })
      .eq("id", runId);
    return { runId, status: "failed", error: "Automação ou evento de origem não encontrados." };
  }

  if (!automation.is_active) {
    await admin
      .from("automation_runs")
      .update({ status: "skipped", error_message: "Automação inativa.", finished_at: new Date().toISOString() })
      .eq("id", runId);
    return { runId, status: "skipped" };
  }

  await admin
    .from("automation_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  const cardId = domainEvent.entity_id;
  const { data: card } = await admin
    .from("cards")
    .select("id, pipe_id, current_phase_id, title, due_date, is_archived, is_done")
    .eq("id", cardId)
    .maybeSingle<CardRow>();

  if (!card) {
    return failRun(admin, run, "Card de origem do evento não encontrado (pode ter sido removido).");
  }

  const { data: fieldValueRows } = await admin
    .from("card_field_values")
    .select("field_id, value")
    .eq("card_id", cardId);

  const snapshot: CardSnapshot = {
    ...Object.fromEntries(
      ((fieldValueRows ?? []) as { field_id: string; value: unknown }[]).map((row) => [row.field_id, row.value]),
    ),
    __currentPhaseId: card.current_phase_id,
    __title: card.title,
    __dueDate: card.due_date,
    __isArchived: card.is_archived,
    __isDone: card.is_done,
  };

  const conditionsMet = evaluateConditions(automation.conditions ?? [], snapshot);
  if (!conditionsMet) {
    await admin
      .from("automation_runs")
      .update({
        status: "skipped",
        finished_at: new Date().toISOString(),
        result: { reason: "conditions_not_met" },
      })
      .eq("id", runId);
    return { runId, status: "skipped" };
  }

  const resolved = resolveActions(automation.actions ?? [], { currentPhaseId: card.current_phase_id });
  const executed: { type: string; skipped: boolean; skipReason?: string }[] = [];

  try {
    for (const effect of resolved) {
      if (effect.skip) {
        executed.push({ type: effect.action.type, skipped: true, skipReason: effect.skipReason });
        continue;
      }
      await executeAction(admin, effect.action, {
        cardId,
        actorId: automation.created_by,
        causationEventId: domainEvent.id,
      });
      executed.push({ type: effect.action.type, skipped: false });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao executar ação.";
    return failRun(admin, run, message);
  }

  await admin
    .from("automation_runs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      error_message: null,
      result: { executed },
    })
    .eq("id", runId);

  return { runId, status: "succeeded" };
}

/**
 * Marca a run como falha, incrementando `attempt` e voltando para
 * 'pending' se ainda houver tentativas disponíveis (retry — quem decide
 * QUANDO reprocessar é o worker externo, este código só sinaliza que pode
 * tentar de novo), ou como 'failed' definitivo ao esgotar `max_attempts`.
 */
async function failRun(admin: AdminClient, run: AutomationRunRow, message: string): Promise<ProcessRunResult> {
  const nextAttempt = run.attempt + 1;
  if (nextAttempt <= run.max_attempts) {
    await admin
      .from("automation_runs")
      .update({ status: "pending", attempt: nextAttempt, error_message: message, finished_at: null })
      .eq("id", run.id);
    return { runId: run.id, status: "pending", error: message };
  }

  await admin
    .from("automation_runs")
    .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
    .eq("id", run.id);
  return { runId: run.id, status: "failed", error: message };
}

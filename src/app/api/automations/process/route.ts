import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { processAutomationRun } from "@/server/services/automation-processor";
import { processWebhookDelivery } from "@/server/services/webhook-dispatcher";

/**
 * `POST /api/automations/process`: processa um lote de `jobs` pendentes —
 * `automation_run` (M3) E `webhook_delivery` (M7, CLAUDE.md §11
 * "processamento assíncrono" aplicado também a webhooks outbound).
 *
 * DECISÃO DE DESIGN (M7): webhooks outbound reaproveitam a MESMA fila
 * `jobs` do M3 em vez de um endpoint/mecanismo de fila separado — ver
 * `20260818094800_webhook_dispatch.sql` para como `emit_domain_event()`
 * enfileira `job_type = 'webhook_delivery'`. Isso significa que esta única
 * rota, protegida pelo mesmo `CRON_SECRET`, processa os dois tipos de
 * trabalho assíncrono da plataforma — nenhuma proteção/agendamento
 * duplicado foi necessário.
 *
 * AGENDAMENTO: `vercel.json` (raiz do projeto) já declara este path como
 * Vercel Cron Job. A Vercel invoca cron jobs com `GET` e, quando existe uma
 * env var chamada exatamente `CRON_SECRET` no projeto, anexa automaticamente
 * o header `Authorization: Bearer <CRON_SECRET>` — por isso o `GET` abaixo
 * aceita esse esquema, além do `x-cron-secret` original (mantido para quem
 * chamar via `POST` manualmente ou de um cron externo/self-hosted). Fora da
 * Vercel (deploy self-hosted), configure um cron externo equivalente
 * apontando para este path com um dos dois esquemas de autenticação.
 *
 * Proteção: exige o header `x-cron-secret` OU `Authorization: Bearer`
 * iguais à env var `CRON_SECRET` (nunca hardcoded — CLAUDE.md §10 "nunca
 * exponha... credenciais administrativas"). Sem `CRON_SECRET` configurada,
 * a rota recusa QUALQUER chamada (fail-closed, nunca fail-open).
 */

const JOB_BATCH_LIMIT = 20;

interface JobRow {
  id: string;
  job_type: string;
  payload: { automation_run_id?: string; webhook_delivery_id?: string };
  attempts: number;
  max_attempts: number;
}

function isAuthorizedCronRequest(request: Request, cronSecret: string): boolean {
  const customHeader = request.headers.get("x-cron-secret");
  if (customHeader && customHeader === cronSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado no servidor. Recusando processar (fail-closed)." },
      { status: 503 },
    );
  }

  if (!isAuthorizedCronRequest(request, cronSecret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verificações periódicas (card.overdue / phase.sla.exceeded) — ver
  // check_overdue_cards()/check_sla_exceeded() nas migrations de M3. Não
  // fatais: se uma falhar, ainda tentamos processar a fila de jobs.
  const periodicChecks: Record<string, number | string> = {};
  const overdueResult = await admin.rpc("check_overdue_cards");
  periodicChecks.card_overdue_emitted = overdueResult.error ? `erro: ${overdueResult.error.message}` : (overdueResult.data as number);

  const slaResult = await admin.rpc("check_sla_exceeded");
  periodicChecks.phase_sla_exceeded_emitted = slaResult.error
    ? `erro: ${slaResult.error.message}`
    : (slaResult.data as number);

  const { data: jobs, error: dequeueError } = await admin.rpc("dequeue_jobs", {
    p_job_type: "automation_run",
    p_limit: JOB_BATCH_LIMIT,
    p_locked_by: "api/automations/process",
  });

  if (dequeueError) {
    return NextResponse.json(
      { error: `Falha ao retirar jobs da fila: ${dequeueError.message}`, periodicChecks },
      { status: 500 },
    );
  }

  const results: { jobId: string; automationRunId: string | undefined; status: string; error?: string }[] = [];

  for (const job of (jobs ?? []) as JobRow[]) {
    const automationRunId = job.payload?.automation_run_id;
    if (!automationRunId) {
      await admin
        .from("jobs")
        .update({ status: "failed", error_message: "Job sem automation_run_id no payload." })
        .eq("id", job.id);
      results.push({ jobId: job.id, automationRunId, status: "failed", error: "payload inválido" });
      continue;
    }

    try {
      const runResult = await processAutomationRun(automationRunId);

      if (runResult.status === "succeeded" || runResult.status === "skipped") {
        await admin.from("jobs").update({ status: "succeeded", error_message: null }).eq("id", job.id);
      } else if (runResult.status === "pending") {
        // Run será reprocessada em um próximo lote — reabre o job para
        // nova retirada (run_at = now(): já pode ser pego na próxima
        // chamada; um backoff mais sofisticado fica fora do escopo).
        await admin
          .from("jobs")
          .update({ status: "pending", run_at: new Date().toISOString(), error_message: runResult.error ?? null })
          .eq("id", job.id);
      } else {
        const jobFailed = job.attempts >= job.max_attempts;
        await admin
          .from("jobs")
          .update({ status: jobFailed ? "failed" : "pending", error_message: runResult.error ?? null })
          .eq("id", job.id);
      }

      results.push({ jobId: job.id, automationRunId, status: runResult.status, error: runResult.error });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido ao processar job.";
      await admin.from("jobs").update({ status: "failed", error_message: message }).eq("id", job.id);
      results.push({ jobId: job.id, automationRunId, status: "failed", error: message });
    }
  }

  const { data: webhookJobs, error: webhookDequeueError } = await admin.rpc("dequeue_jobs", {
    p_job_type: "webhook_delivery",
    p_limit: JOB_BATCH_LIMIT,
    p_locked_by: "api/automations/process",
  });

  const webhookResults: { jobId: string; webhookDeliveryId: string | undefined; status: string; error?: string }[] =
    [];

  if (webhookDequeueError) {
    return NextResponse.json({
      periodicChecks,
      processed: results.length,
      results,
      webhookDequeueError: webhookDequeueError.message,
    });
  }

  for (const job of (webhookJobs ?? []) as JobRow[]) {
    const webhookDeliveryId = job.payload?.webhook_delivery_id;
    if (!webhookDeliveryId) {
      await admin
        .from("jobs")
        .update({ status: "failed", error_message: "Job sem webhook_delivery_id no payload." })
        .eq("id", job.id);
      webhookResults.push({ jobId: job.id, webhookDeliveryId, status: "failed", error: "payload inválido" });
      continue;
    }

    try {
      const deliveryResult = await processWebhookDelivery(webhookDeliveryId);

      if (deliveryResult.status === "delivered") {
        await admin.from("jobs").update({ status: "succeeded", error_message: null }).eq("id", job.id);
      } else if (deliveryResult.status === "pending") {
        // Delivery será reprocessada em um próximo lote — reabre o job
        // (mesmo padrão de automation_run acima).
        await admin
          .from("jobs")
          .update({ status: "pending", run_at: new Date().toISOString(), error_message: deliveryResult.error ?? null })
          .eq("id", job.id);
      } else {
        const jobFailed = job.attempts >= job.max_attempts;
        await admin
          .from("jobs")
          .update({ status: jobFailed ? "failed" : "pending", error_message: deliveryResult.error ?? null })
          .eq("id", job.id);
      }

      webhookResults.push({
        jobId: job.id,
        webhookDeliveryId,
        status: deliveryResult.status,
        error: deliveryResult.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido ao processar job.";
      await admin.from("jobs").update({ status: "failed", error_message: message }).eq("id", job.id);
      webhookResults.push({ jobId: job.id, webhookDeliveryId, status: "failed", error: message });
    }
  }

  return NextResponse.json({
    periodicChecks,
    processed: results.length,
    results,
    webhooksProcessed: webhookResults.length,
    webhookResults,
  });
}

// Vercel Cron Jobs invocam via GET (ver `vercel.json` e o comentário no
// topo do arquivo) — delega para a mesma lógica de POST.
export async function GET(request: Request) {
  return POST(request);
}

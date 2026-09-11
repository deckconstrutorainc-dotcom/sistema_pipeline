import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { processAiRun } from "@/server/services/ai-run-processor";

/**
 * `POST /api/ai/process`: processa um lote de `jobs` pendentes do tipo
 * `ai_run` (CLAUDE.md §11/§17 "processamento preferencialmente
 * assíncrono"). Reaproveita a MESMA fila `jobs` e a MESMA função
 * `dequeue_jobs` do M3 (ver `20260818092000_dequeue_jobs_function.sql`) em
 * vez de inventar um mecanismo novo — mesma decisão de design já usada por
 * webhooks outbound no M7 (`/api/automations/process`).
 *
 * AGENDAMENTO: `vercel.json` (raiz do projeto) já declara este path como
 * Vercel Cron Job (mesmo esquema de `/api/automations/process` — ver o
 * comentário lá para o racional completo de `GET` + `Authorization: Bearer`
 * vs. `POST` + `x-cron-secret`). Fora da Vercel, configure um cron externo
 * equivalente.
 *
 * Proteção: exige o header `x-cron-secret` OU `Authorization: Bearer`
 * iguais à env var `CRON_SECRET` (mesma variável já usada por
 * `/api/automations/process` — não é necessário um segredo separado). Sem
 * `CRON_SECRET` configurada, a rota recusa QUALQUER chamada (fail-closed,
 * nunca fail-open).
 *
 * Diferente de `automation_runs`/`webhook_deliveries`, uma `ai_run` que
 * falha NÃO tem retry automático (ver `ai-run-processor.ts`) — então o job
 * correspondente é sempre marcado 'succeeded' quando `processAiRun`
 * retorna normalmente (o PROCESSAMENTO ocorreu com sucesso, mesmo que o
 * RESULTADO da run tenha sido 'failed'); o job só falha/retenta quando
 * `processAiRun` lança uma exceção inesperada (falha de infraestrutura,
 * não de domínio).
 */

const JOB_BATCH_LIMIT = 20;

interface JobRow {
  id: string;
  job_type: string;
  payload: { ai_run_id?: string };
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

  const { data: jobs, error: dequeueError } = await admin.rpc("dequeue_jobs", {
    p_job_type: "ai_run",
    p_limit: JOB_BATCH_LIMIT,
    p_locked_by: "api/ai/process",
  });

  if (dequeueError) {
    return NextResponse.json({ error: `Falha ao retirar jobs da fila: ${dequeueError.message}` }, { status: 500 });
  }

  const results: { jobId: string; aiRunId: string | undefined; status: string; error?: string }[] = [];

  for (const job of (jobs ?? []) as JobRow[]) {
    const aiRunId = job.payload?.ai_run_id;
    if (!aiRunId) {
      await admin
        .from("jobs")
        .update({ status: "failed", error_message: "Job sem ai_run_id no payload." })
        .eq("id", job.id);
      results.push({ jobId: job.id, aiRunId, status: "failed", error: "payload inválido" });
      continue;
    }

    try {
      const runResult = await processAiRun(aiRunId);
      // Processamento concluído sem exceção — o job cumpriu seu papel,
      // independentemente do status final da run (succeeded/failed/
      // awaiting_approval): não há retry automático de ai_run (ver
      // comentário no topo do arquivo).
      await admin.from("jobs").update({ status: "succeeded", error_message: null }).eq("id", job.id);
      results.push({ jobId: job.id, aiRunId, status: runResult.status, error: runResult.error });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido ao processar job.";
      const jobFailed = job.attempts >= job.max_attempts;
      await admin
        .from("jobs")
        .update({ status: jobFailed ? "failed" : "pending", error_message: message })
        .eq("id", job.id);
      results.push({ jobId: job.id, aiRunId, status: "failed", error: message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

// Vercel Cron Jobs invocam via GET (ver `vercel.json` e o comentário no
// topo do arquivo) — delega para a mesma lógica de POST.
export async function GET(request: Request) {
  return POST(request);
}

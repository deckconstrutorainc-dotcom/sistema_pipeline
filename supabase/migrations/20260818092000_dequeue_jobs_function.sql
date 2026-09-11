-- M3 — Automação
-- `dequeue_jobs()`: retirada segura de um lote de jobs pendentes da fila
-- (`jobs`), usada por `POST /api/automations/process`.
--
-- `for update skip locked` garante que, se por acaso duas chamadas ao
-- endpoint de processamento rodarem concorrentemente (ex.: dois disparos
-- de cron sobrepostos), elas nunca pegam o MESMO job — cada uma pula as
-- linhas já travadas pela outra em vez de esperar/colidir. Isso é o que
-- torna o mecanismo de fila seguro para concorrência mesmo sem um worker
-- dedicado de longa duração (CLAUDE.md §11 "processamento assíncrono" +
-- "retries").

create or replace function public.dequeue_jobs(p_job_type text, p_limit integer, p_locked_by text)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.jobs
    set status = 'processing',
        locked_at = now(),
        locked_by = p_locked_by,
        attempts = attempts + 1
    where id in (
      select id
      from public.jobs
      where job_type = p_job_type
        and status = 'pending'
        and run_at <= now()
      order by run_at
      limit p_limit
      for update skip locked
    )
    returning *;
end;
$$;

comment on function public.dequeue_jobs(text, integer, text) is
  'Retira até p_limit jobs pendentes de um tipo, marcando-os processing de forma segura para concorrência (FOR UPDATE SKIP LOCKED). Usada só pelo route handler /api/automations/process via service role.';

revoke all on function public.dequeue_jobs(text, integer, text) from public;
grant execute on function public.dequeue_jobs(text, integer, text) to service_role;

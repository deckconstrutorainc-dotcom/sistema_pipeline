-- M8 — Intelligence
-- `approve_ai_run`: ÚNICA via de escrita disponível ao client autenticado
-- sobre `ai_runs` (que não tem nenhuma policy de INSERT/UPDATE/DELETE — ver
-- migration anterior). Implementa o portão de "human-in-the-loop"
-- (CLAUDE.md §17/§3.29 "Ações críticas de IA podem exigir aprovação
-- humana") sem dar UPDATE direto ao client — mesmo padrão de `move_card`
-- (M2) e `submit_portal_request` (M5): função SECURITY DEFINER que valida
-- autorização e estado antes de mudar qualquer coluna.
--
-- Autorização: admin/super_admin da organização dona do run — a mesma
-- decisão de "quem pode aprovar" já usada para toda ação administrativa
-- sensível na plataforma (webhooks, integrações, templates de documento).
-- Rejeita explicitamente qualquer chamada para uma run que não esteja em
-- 'awaiting_approval' (não é possível "reaprovar" nem aprovar uma run já
-- succeeded/failed/rejected/pending/running).
--
-- Ao aprovar (p_approve = true): muda o status para 'approved' e enfileira
-- um novo job ('ai_run', mesmo mecanismo de `enqueue_ai_run_job()`) para que
-- `ai-run-processor.ts` retome a execução do tool_call pendente — dentro da
-- MESMA transação da aprovação (nunca fica um 'approved' órfão sem job).
--
-- Ao rejeitar (p_approve = false): muda o status para 'rejected', estado
-- TERMINAL — o tool_call pendente nunca é executado.

create or replace function public.approve_ai_run(p_run_id uuid, p_approve boolean)
returns public.ai_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.ai_runs;
  v_result public.ai_runs;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_run from public.ai_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'Execução de IA não encontrada.';
  end if;

  if not public.has_org_role(v_run.organization_id, array['super_admin', 'admin']) then
    raise exception 'Sem permissão para aprovar/rejeitar execuções de IA nesta organização.';
  end if;

  if v_run.status <> 'awaiting_approval' then
    raise exception 'Esta execução não está aguardando aprovação (status atual: %).', v_run.status;
  end if;

  if p_approve then
    update public.ai_runs
      set status = 'approved',
          approved_by = auth.uid(),
          approved_at = now()
      where id = p_run_id
      returning * into v_result;

    insert into public.jobs (job_type, payload)
    values ('ai_run', jsonb_build_object('ai_run_id', p_run_id));
  else
    update public.ai_runs
      set status = 'rejected',
          approved_by = auth.uid(),
          approved_at = now(),
          finished_at = now()
      where id = p_run_id
      returning * into v_result;
  end if;

  return v_result;
end;
$$;

comment on function public.approve_ai_run(uuid, boolean) is
  'Aprova ou rejeita uma ai_run em awaiting_approval (human-in-the-loop, CLAUDE.md §17/§3.29). Única via de escrita em ai_runs disponível ao client autenticado; exige admin/super_admin da organização; enfileira job de retomada ao aprovar.';

revoke all on function public.approve_ai_run(uuid, boolean) from public;
grant execute on function public.approve_ai_run(uuid, boolean) to authenticated;

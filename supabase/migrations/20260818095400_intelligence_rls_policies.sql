-- M8 — Intelligence
-- Policies de RLS para ai_agents / knowledge_sources / ai_runs /
-- ai_run_evidences (mesma convenção de M2-M7: leitura para membro da
-- organização via `is_org_member`, escrita administrativa via
-- `has_org_role`).
--
-- ai_runs / ai_run_evidences: LEITURA para qualquer membro (observabilidade
-- — CLAUDE.md §18), ZERO policy de escrita para authenticated/anon (só
-- service_role grava; a única exceção controlada é a RPC `approve_ai_run`,
-- que roda como SECURITY DEFINER e por isso não depende de policy de
-- UPDATE). Isso garante que nenhum client pode "fingir" que uma IA rodou —
-- toda ai_run só existe porque o servidor (triggerAiRun/ai-run-processor)
-- de fato a criou/processou.

-- ---------------------------------------------------------------------
-- ai_agents
-- ---------------------------------------------------------------------

drop policy if exists ai_agents_select on public.ai_agents;
create policy ai_agents_select on public.ai_agents
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists ai_agents_insert on public.ai_agents;
create policy ai_agents_insert on public.ai_agents
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists ai_agents_update on public.ai_agents;
create policy ai_agents_update on public.ai_agents
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Sem policy de DELETE: agentes são desativados (is_active=false), nunca
-- excluídos — preserva o histórico de ai_runs que referenciam o agente
-- (ai_runs.ai_agent_id é "on delete restrict").

-- ---------------------------------------------------------------------
-- knowledge_sources
-- ---------------------------------------------------------------------

drop policy if exists knowledge_sources_select on public.knowledge_sources;
create policy knowledge_sources_select on public.knowledge_sources
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists knowledge_sources_insert on public.knowledge_sources;
create policy knowledge_sources_insert on public.knowledge_sources
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists knowledge_sources_update on public.knowledge_sources;
create policy knowledge_sources_update on public.knowledge_sources
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Diferente de ai_agents/webhooks/integrations, knowledge_sources aceita
-- DELETE direto para admin/super_admin: não é uma entidade de negócio com
-- histórico auditável (é um documento de referência para prompt), então
-- curadoria (remover uma fonte desatualizada) é uma operação legítima e não
-- viola CLAUDE.md §22 (que trata de dados de negócio/histórico, não de
-- material de apoio a prompt).
drop policy if exists knowledge_sources_delete on public.knowledge_sources;
create policy knowledge_sources_delete on public.knowledge_sources
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- ai_runs
-- ---------------------------------------------------------------------

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
  for select
  to authenticated
  using (public.is_org_member(organization_id));

-- Nenhuma policy de insert/update/delete de propósito — ver comentário no
-- topo do arquivo e em `20260818095100_ai_runs.sql`.

-- ---------------------------------------------------------------------
-- ai_run_evidences
-- ---------------------------------------------------------------------

drop policy if exists ai_run_evidences_select on public.ai_run_evidences;
create policy ai_run_evidences_select on public.ai_run_evidences
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ai_runs r
      where r.id = ai_run_evidences.ai_run_id
        and public.is_org_member(r.organization_id)
    )
  );

-- Nenhuma policy de insert/update/delete de propósito — escrita exclusiva
-- via service_role (`ai-run-processor.ts`).

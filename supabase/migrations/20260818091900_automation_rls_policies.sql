-- M3 — Automação
-- Policies de RLS para o módulo de automação, e extensão do check
-- constraint de `card_activities.type` para registrar ações executadas por
-- automação (CLAUDE.md §18: automação deve gerar histórico/auditoria).
--
-- Convenção (mesma do M2, ver `20260818091100_workflow_rls_policies.sql`):
--   - `automations`: leitura para qualquer membro do pipe
--     (`is_pipe_member`); escrita (criar/editar/ativar/desativar) somente
--     para quem gerencia a estrutura do pipe (`can_manage_pipe_structure`).
--     Sem policy de DELETE — automations são desativadas (`is_active =
--     false`), nunca excluídas (preserva o histórico de automation_runs,
--     que referencia automation_id).
--   - `automation_runs`: leitura somente para quem gerencia a automação
--     correspondente (`can_manage_pipe_structure` via join com
--     `automations`). Nenhuma policy de INSERT/UPDATE/DELETE — escrita
--     somente via `emit_domain_event()` (criação) e
--     `automation-processor.ts` rodando com service role (atualização de
--     status), nunca via client autenticado comum.
--   - `domain_events`: leitura somente para admin/super_admin da
--     organização (observabilidade/auditoria — CLAUDE.md §11/§18), nunca
--     para membros comuns. Nenhuma policy de escrita — somente via
--     `emit_domain_event()`.
--   - `jobs`: já tratada em `20260818091500_jobs.sql` (RLS habilitada, zero
--     policies — inacessível ao client).

-- ---------------------------------------------------------------------
-- automations
-- ---------------------------------------------------------------------

drop policy if exists automations_select on public.automations;
create policy automations_select on public.automations
  for select
  to authenticated
  using (public.is_pipe_member(pipe_id));

drop policy if exists automations_insert on public.automations;
create policy automations_insert on public.automations
  for insert
  to authenticated
  with check (
    public.can_manage_pipe_structure(pipe_id)
    and created_by = auth.uid()
  );

drop policy if exists automations_update on public.automations;
create policy automations_update on public.automations
  for update
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id))
  with check (public.can_manage_pipe_structure(pipe_id));

-- ---------------------------------------------------------------------
-- automation_runs
-- ---------------------------------------------------------------------

drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.automations a
      where a.id = automation_runs.automation_id
        and public.can_manage_pipe_structure(a.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- domain_events
-- ---------------------------------------------------------------------

drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_select on public.domain_events
  for select
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- card_activities: adiciona o tipo 'automation_action', usado por
-- automation-processor.ts para registrar ações de automação sem
-- equivalente direto entre os tipos já existentes (ex.: send_notification).
-- Ações que já têm um tipo natural (mover fase, atualizar campo, atribuir
-- responsável, aplicar label) continuam usando os tipos existentes
-- ('phase_changed', 'field_updated', 'assigned', 'label_added').
-- ---------------------------------------------------------------------

alter table public.card_activities drop constraint if exists card_activities_type_check;
alter table public.card_activities add constraint card_activities_type_check check (
  type in (
    'card_created',
    'phase_changed',
    'field_updated',
    'assigned',
    'unassigned',
    'label_added',
    'label_removed',
    'comment_added',
    'attachment_added',
    'card_archived',
    'card_unarchived',
    'card_completed',
    'automation_action'
  )
);

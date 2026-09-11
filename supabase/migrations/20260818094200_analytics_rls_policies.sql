-- M6 — Gestão e Analytics
-- Policies de RLS para todas as tabelas do módulo. Convenção (mesmo estilo
-- de `20260818093600_collaboration_rls_policies.sql`):
--   - `reports`/`dashboards`/`interfaces`/`document_templates`
--     (ESTRUTURA): leitura para qualquer membro ativo da organização,
--     escrita (criar/editar/excluir) somente admin/super_admin.
--   - `dashboard_widgets`/`interface_components`: autorização derivada do
--     dashboard/interface pai via subquery (mesmo padrão de
--     `portal_items`), sem policy própria de organization_id direto.
--   - `generated_documents`: leitura para membros da organização do card
--     (via card -> pipe). ZERO policy de INSERT/UPDATE/DELETE para
--     `authenticated` — toda escrita é feita pelo server action
--     `generateDocument` usando createAdminClient() (service role),
--     prevenindo o client de inserir uma linha "generated" simulando
--     sucesso (mesmo padrão de email_threads/email_messages no M5).

-- ---------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- dashboards
-- ---------------------------------------------------------------------

drop policy if exists dashboards_select on public.dashboards;
create policy dashboards_select on public.dashboards
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists dashboards_insert on public.dashboards;
create policy dashboards_insert on public.dashboards
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists dashboards_update on public.dashboards;
create policy dashboards_update on public.dashboards
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists dashboards_delete on public.dashboards;
create policy dashboards_delete on public.dashboards
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- dashboard_widgets
-- ---------------------------------------------------------------------

drop policy if exists dashboard_widgets_select on public.dashboard_widgets;
create policy dashboard_widgets_select on public.dashboard_widgets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_widgets.dashboard_id
        and public.is_org_member(d.organization_id)
    )
  );

drop policy if exists dashboard_widgets_insert on public.dashboard_widgets;
create policy dashboard_widgets_insert on public.dashboard_widgets
  for insert
  to authenticated
  with check (public.can_manage_dashboard(dashboard_id));

drop policy if exists dashboard_widgets_update on public.dashboard_widgets;
create policy dashboard_widgets_update on public.dashboard_widgets
  for update
  to authenticated
  using (public.can_manage_dashboard(dashboard_id))
  with check (public.can_manage_dashboard(dashboard_id));

drop policy if exists dashboard_widgets_delete on public.dashboard_widgets;
create policy dashboard_widgets_delete on public.dashboard_widgets
  for delete
  to authenticated
  using (public.can_manage_dashboard(dashboard_id));

-- ---------------------------------------------------------------------
-- interfaces
-- ---------------------------------------------------------------------

drop policy if exists interfaces_select on public.interfaces;
create policy interfaces_select on public.interfaces
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists interfaces_insert on public.interfaces;
create policy interfaces_insert on public.interfaces
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists interfaces_update on public.interfaces;
create policy interfaces_update on public.interfaces
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists interfaces_delete on public.interfaces;
create policy interfaces_delete on public.interfaces
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- interface_components
-- ---------------------------------------------------------------------

drop policy if exists interface_components_select on public.interface_components;
create policy interface_components_select on public.interface_components
  for select
  to authenticated
  using (
    exists (
      select 1 from public.interfaces i
      where i.id = interface_components.interface_id
        and public.is_org_member(i.organization_id)
    )
  );

drop policy if exists interface_components_insert on public.interface_components;
create policy interface_components_insert on public.interface_components
  for insert
  to authenticated
  with check (public.can_manage_interface(interface_id));

drop policy if exists interface_components_update on public.interface_components;
create policy interface_components_update on public.interface_components
  for update
  to authenticated
  using (public.can_manage_interface(interface_id))
  with check (public.can_manage_interface(interface_id));

drop policy if exists interface_components_delete on public.interface_components;
create policy interface_components_delete on public.interface_components
  for delete
  to authenticated
  using (public.can_manage_interface(interface_id));

-- ---------------------------------------------------------------------
-- document_templates
-- ---------------------------------------------------------------------

drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists document_templates_insert on public.document_templates;
create policy document_templates_insert on public.document_templates
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists document_templates_update on public.document_templates;
create policy document_templates_update on public.document_templates
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Sem policy de DELETE: templates preservam generated_documents que os
-- referenciam (on delete cascade em generated_documents apagaria o
-- histórico de documentos gerados — preferimos não oferecer exclusão via
-- client neste milestone; arquivamento pode ser adicionado depois).

-- ---------------------------------------------------------------------
-- generated_documents
-- ---------------------------------------------------------------------

drop policy if exists generated_documents_select on public.generated_documents;
create policy generated_documents_select on public.generated_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cards c
      join public.pipes p on p.id = c.pipe_id
      where c.id = generated_documents.card_id
        and public.is_org_member(p.organization_id)
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita somente
-- via createAdminClient() em src/server/actions/documents.ts.

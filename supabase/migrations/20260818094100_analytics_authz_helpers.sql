-- M6 — Gestão e Analytics
-- Funções auxiliares SECURITY DEFINER para autorização do módulo de
-- gestão/analytics — mesmo padrão de `can_manage_portal` (M5),
-- `card_organization_id` (M4) etc.

create or replace function public.can_manage_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    (select organization_id from public.reports where id = target_report_id),
    array['super_admin', 'admin']
  );
$$;

comment on function public.can_manage_report(uuid) is
  'True se o usuário autenticado pode gerenciar (criar/editar/excluir) o report informado: admin/super_admin da organização dona do report.';

create or replace function public.can_manage_dashboard(target_dashboard_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    (select organization_id from public.dashboards where id = target_dashboard_id),
    array['super_admin', 'admin']
  );
$$;

comment on function public.can_manage_dashboard(uuid) is
  'True se o usuário autenticado pode gerenciar o dashboard informado: admin/super_admin da organização dona do dashboard.';

create or replace function public.dashboard_widget_organization_id(target_widget_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.organization_id
  from public.dashboard_widgets w
  join public.dashboards d on d.id = w.dashboard_id
  where w.id = target_widget_id;
$$;

comment on function public.dashboard_widget_organization_id(uuid) is
  'Resolve a organização dona de um dashboard_widget, via o dashboard ao qual pertence.';

create or replace function public.can_manage_interface(target_interface_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    (select organization_id from public.interfaces where id = target_interface_id),
    array['super_admin', 'admin']
  );
$$;

comment on function public.can_manage_interface(uuid) is
  'True se o usuário autenticado pode gerenciar a interface informada: admin/super_admin da organização dona da interface.';

create or replace function public.interface_component_organization_id(target_component_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.organization_id
  from public.interface_components c
  join public.interfaces i on i.id = c.interface_id
  where c.id = target_component_id;
$$;

comment on function public.interface_component_organization_id(uuid) is
  'Resolve a organização dona de um interface_component, via a interface à qual pertence.';

create or replace function public.can_manage_document_template(target_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    (select organization_id from public.document_templates where id = target_template_id),
    array['super_admin', 'admin']
  );
$$;

comment on function public.can_manage_document_template(uuid) is
  'True se o usuário autenticado pode gerenciar (criar/editar) o template de documento informado: admin/super_admin da organização dona do template.';

create or replace function public.generated_document_organization_id(target_document_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.generated_documents gd
  join public.cards c on c.id = gd.card_id
  join public.pipes p on p.id = c.pipe_id
  where gd.id = target_document_id;
$$;

comment on function public.generated_document_organization_id(uuid) is
  'Resolve a organização dona de um generated_document, via card -> pipe (cards não possuem organization_id direto).';

revoke all on function public.can_manage_report(uuid) from public;
grant execute on function public.can_manage_report(uuid) to authenticated;
revoke all on function public.can_manage_dashboard(uuid) from public;
grant execute on function public.can_manage_dashboard(uuid) to authenticated;
revoke all on function public.dashboard_widget_organization_id(uuid) from public;
grant execute on function public.dashboard_widget_organization_id(uuid) to authenticated;
revoke all on function public.can_manage_interface(uuid) from public;
grant execute on function public.can_manage_interface(uuid) to authenticated;
revoke all on function public.interface_component_organization_id(uuid) from public;
grant execute on function public.interface_component_organization_id(uuid) to authenticated;
revoke all on function public.can_manage_document_template(uuid) from public;
grant execute on function public.can_manage_document_template(uuid) to authenticated;
revoke all on function public.generated_document_organization_id(uuid) from public;
grant execute on function public.generated_document_organization_id(uuid) to authenticated;

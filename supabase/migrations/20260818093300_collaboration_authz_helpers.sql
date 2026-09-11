-- M5 — Colaboração Externa
-- Funções auxiliares SECURITY DEFINER para autorização do módulo de
-- colaboração externa — mesmo padrão de `is_org_member`/`has_org_role` (M1),
-- `is_pipe_member`/`can_manage_pipe_structure` (M2) e
-- `card_organization_id` (M4, reaproveitado aqui).

create or replace function public.can_manage_portal(target_portal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    (select organization_id from public.portals where id = target_portal_id),
    array['super_admin', 'admin']
  );
$$;

comment on function public.can_manage_portal(uuid) is
  'True se o usuário autenticado pode gerenciar (criar/editar/ativar) o portal informado: admin/super_admin da organização dona do portal.';

create or replace function public.request_organization_id(target_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.requests r
  join public.portals p on p.id = r.portal_id
  where r.id = target_request_id;
$$;

comment on function public.request_organization_id(uuid) is
  'Resolve a organização dona de uma request, via o portal ao qual pertence.';

create or replace function public.email_thread_pipe_id(target_thread_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.pipe_id
  from public.email_threads t
  join public.cards c on c.id = t.card_id
  where t.id = target_thread_id;
$$;

comment on function public.email_thread_pipe_id(uuid) is
  'Resolve o pipe do card ao qual uma thread de e-mail está vinculada — usada para checar is_pipe_member().';

revoke all on function public.can_manage_portal(uuid) from public;
grant execute on function public.can_manage_portal(uuid) to authenticated;
revoke all on function public.request_organization_id(uuid) from public;
grant execute on function public.request_organization_id(uuid) to authenticated;
revoke all on function public.email_thread_pipe_id(uuid) from public;
grant execute on function public.email_thread_pipe_id(uuid) to authenticated;

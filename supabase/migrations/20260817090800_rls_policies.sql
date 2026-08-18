-- M1 — Segurança e Tenant
-- Policies de RLS para todas as tabelas criadas neste milestone.
-- Todas as tabelas já tiveram `enable row level security` nas migrations
-- anteriores. Nenhuma tabela é aberta com `using (true)` fora dos casos
-- explicitamente justificados (roles/permissions são catálogo global
-- somente leitura para qualquer usuário autenticado).

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.shares_org_with(id)
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Sem policy de DELETE: exclusão de profile não é permitida via client
-- (segue o ciclo de vida de auth.users, on delete cascade).

-- ---------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

-- INSERT direto permanece disponível (ex.: ferramentas administrativas),
-- mas o fluxo de produto (onboarding) usa a RPC
-- create_organization_with_owner, que garante criação de org + membership
-- em transação única.
drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update
  to authenticated
  using (public.has_org_role(id, array['super_admin', 'admin']))
  with check (public.has_org_role(id, array['super_admin', 'admin']));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete
  to authenticated
  using (public.has_org_role(id, array['super_admin']));

-- ---------------------------------------------------------------------
-- organization_memberships
-- ---------------------------------------------------------------------

drop policy if exists organization_memberships_select on public.organization_memberships;
create policy organization_memberships_select on public.organization_memberships
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists organization_memberships_insert on public.organization_memberships;
create policy organization_memberships_insert on public.organization_memberships
  for insert
  to authenticated
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists organization_memberships_update on public.organization_memberships;
create policy organization_memberships_update on public.organization_memberships
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists organization_memberships_delete on public.organization_memberships;
create policy organization_memberships_delete on public.organization_memberships
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- roles / permissions / role_permissions
-- Catálogo global do sistema: leitura liberada a qualquer usuário
-- autenticado, escrita reservada a migrations/seed (service role).
-- ---------------------------------------------------------------------

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select
  to authenticated
  using (true);

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select
  to authenticated
  using (true);

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert
  to authenticated
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- group_members
-- Autorização derivada da organização do grupo (via subquery em `groups`,
-- não em `group_members`, para não introduzir recursão).
-- ---------------------------------------------------------------------

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and public.is_org_member(g.organization_id)
    )
  );

drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and public.has_org_role(g.organization_id, array['super_admin', 'admin'])
    )
  );

drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and public.has_org_role(g.organization_id, array['super_admin', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and public.has_org_role(g.organization_id, array['super_admin', 'admin'])
    )
  );

drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and public.has_org_role(g.organization_id, array['super_admin', 'admin'])
    )
  );

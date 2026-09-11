-- M1 — Segurança e Tenant
-- Funções auxiliares SECURITY DEFINER usadas pelas policies de RLS.
--
-- Por que SECURITY DEFINER: uma policy em `organization_memberships` que
-- precisasse fazer SELECT na própria `organization_memberships` para checar
-- autorização causaria recursão infinita de RLS. O padrão recomendado pelo
-- Supabase é isolar essa checagem em uma função SECURITY DEFINER (executa
-- com o papel do owner da função, que não sofre RLS na tabela), com
-- `search_path` fixo para evitar sequestro de função.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

comment on function public.is_org_member(uuid) is
  'True se o usuário autenticado é membro ativo da organização informada.';

create or replace function public.has_org_role(target_org_id uuid, role_keys text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.key = any (role_keys)
  );
$$;

comment on function public.has_org_role(uuid, text[]) is
  'True se o usuário autenticado tem, na organização informada, um papel ativo dentre os informados.';

create or replace function public.shares_org_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships mine
    join public.organization_memberships theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = target_user_id
      and theirs.status = 'active'
  );
$$;

comment on function public.shares_org_with(uuid) is
  'True se o usuário autenticado compartilha ao menos uma organização ativa com o usuário informado.';

-- Exposição explícita via RPC (PostgREST) para uso a partir do servidor da
-- aplicação (ex.: requireOrgRole), reaproveitando a mesma lógica usada pelas
-- policies de RLS como fonte única de verdade.
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

revoke all on function public.shares_org_with(uuid) from public;
grant execute on function public.shares_org_with(uuid) to authenticated;

-- RPC de onboarding: cria a organização e a membership do criador (papel
-- super_admin) em uma única transação atômica. Evita depender de uma policy
-- de INSERT em organization_memberships liberada para "qualquer usuário",
-- que abriria brecha para se auto-atribuir a organizações existentes.
create or replace function public.create_organization_with_owner(org_name text, org_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
  owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select id into owner_role_id from public.roles where key = 'super_admin';
  if owner_role_id is null then
    raise exception 'Papel super_admin não encontrado. Execute o seed de roles.';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (org_name, org_slug, auth.uid())
  returning * into new_org;

  insert into public.organization_memberships (organization_id, user_id, role_id, status, invited_by)
  values (new_org.id, auth.uid(), owner_role_id, 'active', auth.uid());

  return new_org;
end;
$$;

comment on function public.create_organization_with_owner(text, text) is
  'Onboarding: cria organização + membership super_admin do criador em transação atômica.';

revoke all on function public.create_organization_with_owner(text, text) from public;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;

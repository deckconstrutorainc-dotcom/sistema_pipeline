-- M4 — Data Hub
-- Funções auxiliares SECURITY DEFINER para autorização do Data Hub, mesmo
-- padrão de `is_org_member`/`has_org_role` (M1) e `is_pipe_member`/
-- `can_manage_pipe_structure` (M2): evita recursão de RLS e centraliza a
-- checagem cross-tenant em um único lugar (fonte de verdade), tanto para
-- as policies de RLS quanto para os triggers de validação abaixo.

create or replace function public.database_organization_id(target_database_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.databases where id = target_database_id;
$$;

comment on function public.database_organization_id(uuid) is
  'Resolve a organização dona de um database.';

create or replace function public.record_organization_id(target_record_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.database_organization_id(r.database_id)
  from public.records r
  where r.id = target_record_id;
$$;

comment on function public.record_organization_id(uuid) is
  'Resolve a organização dona de um record, via o database ao qual pertence.';

create or replace function public.card_organization_id(target_card_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.pipe_organization_id(c.pipe_id)
  from public.cards c
  where c.id = target_card_id;
$$;

comment on function public.card_organization_id(uuid) is
  'Resolve a organização dona de um card, via o pipe ao qual pertence. Reaproveita pipe_organization_id (M2).';

-- Leitura/uso de databases: qualquer membro ativo da organização (recurso
-- compartilhado — CLAUDE.md/PROMPT_MESTRE M4: "todo membro pode ver e usar
-- databases para popular campos de card").
create or replace function public.is_org_member_of_database(target_database_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(public.database_organization_id(target_database_id));
$$;

comment on function public.is_org_member_of_database(uuid) is
  'True se o usuário autenticado é membro ativo da organização dona do database informado.';

create or replace function public.is_org_member_of_record(target_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_member(public.record_organization_id(target_record_id));
$$;

comment on function public.is_org_member_of_record(uuid) is
  'True se o usuário autenticado é membro ativo da organização dona do record informado.';

-- Escrita da ESTRUTURA de um database (nome, campos): admin/super_admin,
-- mesmo nível de `can_manage_pipe_structure` no M2. Escrita de REGISTROS
-- (records/record_values) é mais permissiva — ver
-- `is_org_member_of_database`/`is_org_member_of_record` usados nas
-- policies de `records`/`record_values`.
create or replace function public.can_manage_database_structure(target_database_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(public.database_organization_id(target_database_id), array['super_admin', 'admin']);
$$;

comment on function public.can_manage_database_structure(uuid) is
  'True se o usuário autenticado pode gerenciar a estrutura do database (nome, campos): admin/super_admin da organização dona do database.';

-- ---------------------------------------------------------------------
-- Autorização de conexões (defesa em profundidade cross-tenant).
--
-- Estas duas funções são a ÚNICA fonte de verdade sobre "pode conectar
-- X a Y" — usadas tanto pelas policies de INSERT (RLS) quanto por um
-- trigger BEFORE INSERT nas tabelas de conexão, para nunca depender
-- apenas da policy (defesa em profundidade: mesmo que uma policy futura
-- seja escrita incorretamente, o trigger ainda barra a conexão
-- cross-tenant).
-- ---------------------------------------------------------------------

create or replace function public.can_connect_card_and_record(target_card_id uuid, target_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_pipe_member((select c.pipe_id from public.cards c where c.id = target_card_id))
    and public.card_organization_id(target_card_id) is not null
    and public.card_organization_id(target_card_id) = public.record_organization_id(target_record_id);
$$;

comment on function public.can_connect_card_and_record(uuid, uuid) is
  'True somente se o usuário é membro do pipe do card E o card e o record pertencem à MESMA organização — nunca permite conectar card de uma organização a record de outra (CLAUDE.md §6/§11).';

create or replace function public.can_connect_cards(target_card_id_a uuid, target_card_id_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_card_id_a <> target_card_id_b
    and public.is_pipe_member((select c.pipe_id from public.cards c where c.id = target_card_id_a))
    and public.is_pipe_member((select c.pipe_id from public.cards c where c.id = target_card_id_b))
    and public.card_organization_id(target_card_id_a) is not null
    and public.card_organization_id(target_card_id_a) = public.card_organization_id(target_card_id_b);
$$;

comment on function public.can_connect_cards(uuid, uuid) is
  'True somente se o usuário é membro do pipe de AMBOS os cards E os dois cards pertencem à MESMA organização — nunca permite conectar cards de organizações diferentes.';

revoke all on function public.database_organization_id(uuid) from public;
grant execute on function public.database_organization_id(uuid) to authenticated;
revoke all on function public.record_organization_id(uuid) from public;
grant execute on function public.record_organization_id(uuid) to authenticated;
revoke all on function public.card_organization_id(uuid) from public;
grant execute on function public.card_organization_id(uuid) to authenticated;
revoke all on function public.is_org_member_of_database(uuid) from public;
grant execute on function public.is_org_member_of_database(uuid) to authenticated;
revoke all on function public.is_org_member_of_record(uuid) from public;
grant execute on function public.is_org_member_of_record(uuid) to authenticated;
revoke all on function public.can_manage_database_structure(uuid) from public;
grant execute on function public.can_manage_database_structure(uuid) to authenticated;
revoke all on function public.can_connect_card_and_record(uuid, uuid) from public;
grant execute on function public.can_connect_card_and_record(uuid, uuid) to authenticated;
revoke all on function public.can_connect_cards(uuid, uuid) from public;
grant execute on function public.can_connect_cards(uuid, uuid) to authenticated;

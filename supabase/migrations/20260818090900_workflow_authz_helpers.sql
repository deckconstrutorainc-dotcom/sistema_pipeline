-- M2 — Workflow Core
-- Funções auxiliares SECURITY DEFINER para autorização no módulo de
-- workflow, seguindo exatamente o mesmo padrão de `is_org_member`/
-- `has_org_role` do M1 (evita recursão de RLS; search_path fixo).

create or replace function public.pipe_organization_id(target_pipe_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.pipes where id = target_pipe_id;
$$;

comment on function public.pipe_organization_id(uuid) is
  'Resolve a organização dona de um pipe. Base para as demais funções de autorização de workflow.';

create or replace function public.is_pipe_member(target_pipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pipes p
    where p.id = target_pipe_id
      and public.is_org_member(p.organization_id)
      and (
        p.is_restricted = false
        or public.has_org_role(p.organization_id, array['super_admin', 'admin'])
        or exists (
          select 1
          from public.pipe_memberships pm
          where pm.pipe_id = p.id
            and pm.user_id = auth.uid()
        )
      )
  );
$$;

comment on function public.is_pipe_member(uuid) is
  'True se o usuário autenticado pode acessar o pipe: membro da organização e (pipe não restrito, OU admin/super_admin da organização, OU listado em pipe_memberships).';

create or replace function public.can_manage_pipe_structure(target_pipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(public.pipe_organization_id(target_pipe_id), array['super_admin', 'admin']);
$$;

comment on function public.can_manage_pipe_structure(uuid) is
  'True se o usuário autenticado pode gerenciar a estrutura do pipe (fases, campos, labels): admin/super_admin da organização dona do pipe.';

revoke all on function public.pipe_organization_id(uuid) from public;
grant execute on function public.pipe_organization_id(uuid) to authenticated;

revoke all on function public.is_pipe_member(uuid) from public;
grant execute on function public.is_pipe_member(uuid) to authenticated;

revoke all on function public.can_manage_pipe_structure(uuid) from public;
grant execute on function public.can_manage_pipe_structure(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- log_card_activity: única via de escrita em card_activities a partir do
-- client autenticado. Verifica autorização (is_pipe_member) antes de
-- inserir, e sempre grava actor_id = auth.uid() (não confia em valor
-- enviado pelo chamador).
-- ---------------------------------------------------------------------

create or replace function public.log_card_activity(p_card_id uuid, p_type text, p_payload jsonb default '{}'::jsonb)
returns public.card_activities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipe_id uuid;
  v_row public.card_activities;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select pipe_id into v_pipe_id from public.cards where id = p_card_id;
  if v_pipe_id is null then
    raise exception 'Card não encontrado.';
  end if;

  if not public.is_pipe_member(v_pipe_id) then
    raise exception 'Sem permissão para este pipe.';
  end if;

  insert into public.card_activities (card_id, actor_id, type, payload)
  values (p_card_id, auth.uid(), p_type, coalesce(p_payload, '{}'::jsonb))
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.log_card_activity(uuid, text, jsonb) is
  'Registra uma entrada de histórico para um card, validando autorização e gravando actor_id a partir de auth.uid() (nunca confiando em valor do client). Chamada pelos server actions após operações de card (criação, atribuição, label, comentário, anexo).';

revoke all on function public.log_card_activity(uuid, text, jsonb) from public;
grant execute on function public.log_card_activity(uuid, text, jsonb) to authenticated;

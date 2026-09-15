-- =====================================================================
-- Colaboradores convidados em um card
--
-- Problema que resolve: com os pipes restritos por setor, a Isabele
-- (Compras) não enxerga um card de Orçamentos, e vice-versa. Mas o fluxo
-- real da empresa atravessa setores — Orçamentos precisa que Compras faça
-- uma cotação dentro daquela oportunidade.
--
-- Por que não usar `pipe_memberships`: daria acesso ao PIPE INTEIRO, e só
-- admin pode concedê-lo (`can_manage_pipe_structure`). Convidar alguém
-- para uma tarefa não deveria abrir todo o processo do setor, nem exigir
-- um administrador a cada vez.
--
-- Aqui o acesso é por CARD: o convidado vê aquela atividade e nada mais do
-- pipe. Quem já é membro do pipe pode convidar; não precisa ser admin.
-- =====================================================================

create table if not exists public.card_collaborators (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete restrict,
  -- O que se espera da pessoa. Texto livre: é uma instrução entre
  -- colegas, não um campo de processo.
  request text,
  created_at timestamptz not null default now(),
  constraint card_collaborators_unique unique (card_id, user_id)
);

comment on table public.card_collaborators is
  'Pessoa de outro setor convidada a colaborar em um card específico. Concede acesso APENAS àquele card, não ao pipe.';

create index if not exists card_collaborators_user_idx
  on public.card_collaborators (user_id);

create index if not exists card_collaborators_card_idx
  on public.card_collaborators (card_id);

-- ---------------------------------------------------------------------
-- Acesso ao card: membro do pipe OU convidado
-- ---------------------------------------------------------------------

create or replace function public.is_card_collaborator(target_card_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.card_collaborators cc
    join public.cards c on c.id = cc.card_id
    where cc.card_id = target_card_id
      and cc.user_id = auth.uid()
      -- O convite não vale fora da organização: se a pessoa for removida
      -- da empresa, perde o acesso mesmo com o convite de pé. `cards` não
      -- guarda organization_id — a organização vem pelo pipe.
      and public.is_org_member(public.pipe_organization_id(c.pipe_id))
  );
$$;

comment on function public.is_card_collaborator(uuid) is
  'True se o usuário foi convidado a colaborar neste card específico (card_collaborators) e continua sendo membro da organização.';

/**
 * Regra de acesso a um card: membro do pipe, ou convidado para ele.
 *
 * Existe separada de `is_pipe_member` de propósito. `is_pipe_member`
 * responde "esta pessoa participa do processo?" e governa 29 policies —
 * fases, campos, etiquetas, automações. Alargá-la daria ao convidado
 * acesso à estrutura inteira do pipe, que não é o que um convite
 * significa.
 */
create or replace function public.can_access_card(target_card_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cards c
    where c.id = target_card_id
      and (public.is_pipe_member(c.pipe_id) or public.is_card_collaborator(target_card_id))
  );
$$;

comment on function public.can_access_card(uuid) is
  'True se o usuário pode ver/trabalhar neste card: por ser membro do pipe ou por ter sido convidado para o card.';

revoke all on function public.is_card_collaborator(uuid) from public, anon;
revoke all on function public.can_access_card(uuid) from public, anon;
grant execute on function public.is_card_collaborator(uuid) to authenticated, service_role;
grant execute on function public.can_access_card(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS da própria tabela
-- ---------------------------------------------------------------------
alter table public.card_collaborators enable row level security;

create policy card_collaborators_select on public.card_collaborators
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.cards c
      where c.id = card_collaborators.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- Convidar exige ser membro do pipe: quem é apenas convidado não pode
-- repassar o acesso adiante.
create policy card_collaborators_insert on public.card_collaborators
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.cards c
      where c.id = card_collaborators.card_id
        and public.is_pipe_member(c.pipe_id)
    )
    -- O convidado precisa ser da mesma organização. A organização vem
    -- pelo pipe: `cards` não guarda organization_id.
    and exists (
      select 1
      from public.cards c
      join public.organization_memberships m
        on m.organization_id = public.pipe_organization_id(c.pipe_id)
       and m.user_id = card_collaborators.user_id
       and m.status = 'active'
      where c.id = card_collaborators.card_id
    )
  );

-- Remover o convite: membro do pipe, ou a própria pessoa saindo.
create policy card_collaborators_delete on public.card_collaborators
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.cards c
      where c.id = card_collaborators.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

grant select, insert, delete on table public.card_collaborators to authenticated;
grant all on table public.card_collaborators to service_role;

-- ---------------------------------------------------------------------
-- Estende o acesso do convidado ao card e ao que o compõe
-- ---------------------------------------------------------------------
--
-- Só as policies de LEITURA e as de colaboração (comentar, checklist)
-- passam a aceitar o convidado. Mover de fase, editar campos, arquivar e
-- alterar a estrutura do pipe continuam restritos a quem é membro — o
-- convidado colabora, não conduz o processo.

drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards
  for select to authenticated
  using (public.is_pipe_member(pipe_id) or public.is_card_collaborator(id));

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (public.can_access_card(card_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_card(card_id));

drop policy if exists card_activities_select on public.card_activities;
create policy card_activities_select on public.card_activities
  for select to authenticated
  using (public.can_access_card(card_id));

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_access_card(card_id));

drop policy if exists card_assignments_select on public.card_assignments;
create policy card_assignments_select on public.card_assignments
  for select to authenticated
  using (public.can_access_card(card_id));

drop policy if exists card_labels_select on public.card_labels;
create policy card_labels_select on public.card_labels
  for select to authenticated
  using (public.can_access_card(card_id));

drop policy if exists card_field_values_select on public.card_field_values;
create policy card_field_values_select on public.card_field_values
  for select to authenticated
  using (public.can_access_card(card_id));

-- Checklist: o convidado também marca itens — normalmente é justamente a
-- tarefa que lhe foi passada.
drop policy if exists checklist_items_select on public.checklist_items;
create policy checklist_items_select on public.checklist_items
  for select to authenticated
  using (public.can_access_card(card_id));

drop policy if exists checklist_items_update on public.checklist_items;
create policy checklist_items_update on public.checklist_items
  for update to authenticated
  using (public.can_access_card(card_id))
  with check (public.can_access_card(card_id));

-- ---------------------------------------------------------------------
-- Notificação do convite
-- ---------------------------------------------------------------------

create or replace function public.notify_on_card_collaborator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_users(
    new.card_id,
    array[new.user_id],
    'card_assigned',
    new.invited_by,
    public.display_name(new.invited_by) || ' pediu sua ajuda em uma atividade',
    public.card_ref(new.card_id)
      || case
           when nullif(btrim(coalesce(new.request, '')), '') is not null
             then ' — ' || new.request
           else ''
         end
  );
  return new;
end;
$$;

drop trigger if exists notify_on_card_collaborator_trigger on public.card_collaborators;
create trigger notify_on_card_collaborator_trigger
  after insert on public.card_collaborators
  for each row execute function public.notify_on_card_collaborator();

-- A notificação precisa sobreviver à RLS de `cards` para montar o texto:
-- no momento do insert o convidado ainda não tem acesso. `notify_users` já
-- é security definer, então lê como dono — nada a fazer aqui além de
-- registrar o motivo.

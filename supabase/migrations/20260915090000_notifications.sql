-- =====================================================================
-- Notificações internas (in-app)
--
-- Até aqui a ação `send_notification` das automações só escrevia no
-- console: ninguém era avisado de nada. Esta migration cria a tabela de
-- notificações e os gatilhos que a alimentam.
--
-- Decisão de arquitetura: as notificações nascem por TRIGGER no banco, não
-- nas server actions. Motivo: atribuição feita por automação, comentário
-- vindo de portal ou ação via API precisam notificar do mesmo jeito que a
-- interface. Se a regra vivesse só nas actions, esses caminhos ficariam
-- mudos. É o mesmo padrão já usado para domain_events e card_activities
-- (CLAUDE.md §11: persistir antes de processar).
--
-- Eventos cobertos:
--   card_assigned           alguém foi atribuído a um card
--   comment_added           comentário novo (participantes, exceto autor)
--   attachment_added        anexo novo (participantes, exceto quem anexou)
--   card_due_soon           prazo vence em menos de 24h (periódico)
--   card_overdue            prazo vencido (periódico, 1x por card por dia)
--   related_card_completed  um card conectado foi concluído
--   automation              ação send_notification de uma automação
--
-- "Participantes" de um card = responsáveis atribuídos + quem criou.
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  -- cascade: uma notificação sobre um card que deixou de existir não
  -- tem para onde levar o usuário.
  card_id uuid references public.cards (id) on delete cascade,
  type text not null check (type in (
    'card_assigned',
    'comment_added',
    'attachment_added',
    'card_due_soon',
    'card_overdue',
    'related_card_completed',
    'automation'
  )),
  -- Título e corpo são gravados prontos, como snapshot: se o card for
  -- renomeado depois, a notificação continua dizendo o que disse na hora.
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (btrim(title) <> '')
);

comment on table public.notifications is
  'Notificação in-app para um usuário. Criada apenas por triggers/funções security definer; o usuário só lê, marca como lida e apaga as próprias.';

-- Listagem e contador do sino.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

-- Deduplicação das verificações periódicas de prazo.
create index if not exists notifications_card_type_created_idx
  on public.notifications (card_id, type, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Sem policy de INSERT para authenticated: só funções security definer
-- criam notificações. Isso impede que um usuário fabrique avisos para
-- outro.
--
-- UPDATE restrito à coluna read_at (privilégio de coluna): marcar como
-- lida é a única alteração legítima. Título, corpo e destinatário são
-- imutáveis para o usuário.
revoke all on table public.notifications from anon, authenticated;
grant select, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Responsáveis + criador. É quem "tem interesse" no card.
create or replace function public.card_participants(p_card_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ca.user_id from public.card_assignments ca where ca.card_id = p_card_id
  union
  select c.created_by from public.cards c where c.id = p_card_id
$$;

-- "#12 · Título do card", para compor mensagens.
create or replace function public.card_ref(p_card_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '#' || c.number || ' · ' || c.title from public.cards c where c.id = p_card_id
$$;

create or replace function public.display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = p_user_id),
    'Alguém'
  )
$$;

-- Cria uma notificação por destinatário. Nunca notifica o próprio ator:
-- ninguém precisa ser avisado do que acabou de fazer.
create or replace function public.notify_users(
  p_card_id uuid,
  p_user_ids uuid[],
  p_type text,
  p_actor_id uuid,
  p_title text,
  p_body text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_count integer := 0;
begin
  select public.pipe_organization_id(c.pipe_id)
    into v_org_id
  from public.cards c
  where c.id = p_card_id;

  if v_org_id is null then
    return 0;
  end if;

  insert into public.notifications (organization_id, user_id, actor_id, card_id, type, title, body)
  select distinct v_org_id, u, p_actor_id, p_card_id, p_type, p_title, p_body
  from unnest(p_user_ids) as u
  where u is not null
    and (p_actor_id is null or u <> p_actor_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.notify_card_participants(
  p_card_id uuid,
  p_type text,
  p_actor_id uuid,
  p_title text,
  p_body text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.notify_users(
    p_card_id,
    array(select public.card_participants(p_card_id)),
    p_type,
    p_actor_id,
    p_title,
    p_body
  );
end;
$$;

-- Só o worker (service role) pode chamar diretamente — é o que a ação
-- `send_notification` das automações usa. Usuário autenticado não pode:
-- seria uma porta para mandar aviso a qualquer pessoa da organização.
-- `revoke from public` não basta: este projeto concede execute a anon e
-- authenticated por ALTER DEFAULT PRIVILEGES (ver migration de extensions),
-- então cada papel precisa ser revogado explicitamente. Sem isso, qualquer
-- usuário autenticado poderia fabricar notificação para qualquer pessoa da
-- organização.
revoke all on function public.card_participants(uuid) from public, anon, authenticated;
revoke all on function public.card_ref(uuid) from public, anon, authenticated;
revoke all on function public.display_name(uuid) from public, anon, authenticated;
revoke all on function public.notify_users(uuid, uuid[], text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.notify_card_participants(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.notify_users(uuid, uuid[], text, uuid, text, text) to service_role;
grant execute on function public.notify_card_participants(uuid, text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Gatilhos por evento
-- ---------------------------------------------------------------------

create or replace function public.notify_on_card_assignment()
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
    new.assigned_by,
    'Você foi atribuído a uma atividade',
    public.card_ref(new.card_id)
      || case
           when new.assigned_by is not null then ' — por ' || public.display_name(new.assigned_by)
           else ''
         end
  );
  return new;
end;
$$;

drop trigger if exists notify_on_card_assignment_trigger on public.card_assignments;
create trigger notify_on_card_assignment_trigger
  after insert on public.card_assignments
  for each row execute function public.notify_on_card_assignment();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_card_participants(
    new.card_id,
    'comment_added',
    new.author_id,
    public.display_name(new.author_id) || ' comentou em ' || public.card_ref(new.card_id),
    left(new.body, 160)
  );
  return new;
end;
$$;

drop trigger if exists notify_on_comment_trigger on public.comments;
create trigger notify_on_comment_trigger
  after insert on public.comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_card_participants(
    new.card_id,
    'attachment_added',
    new.uploaded_by,
    public.display_name(new.uploaded_by) || ' anexou um arquivo em ' || public.card_ref(new.card_id),
    new.file_name
  );
  return new;
end;
$$;

drop trigger if exists notify_on_attachment_trigger on public.attachments;
create trigger notify_on_attachment_trigger
  after insert on public.attachments
  for each row execute function public.notify_on_attachment();

-- Quando um card é concluído (move_card() para fase final marca is_done),
-- avisa os participantes de todos os cards conectados a ele. É o que
-- fecha o ciclo entre setores: Compras conclui a cotação, Orçamentos é
-- avisado no card que originou o pedido.
create or replace function public.notify_on_card_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_related uuid;
  v_actor uuid := auth.uid();
begin
  if old.is_done or not new.is_done then
    return new;
  end if;

  for v_related in
    select case when cc.card_id_a = new.id then cc.card_id_b else cc.card_id_a end
    from public.card_card_connections cc
    where new.id in (cc.card_id_a, cc.card_id_b)
  loop
    perform public.notify_card_participants(
      v_related,
      'related_card_completed',
      v_actor,
      'Atividade relacionada concluída',
      public.card_ref(new.id) || ' foi concluída — relacionada a ' || public.card_ref(v_related)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_on_card_completed_trigger on public.cards;
create trigger notify_on_card_completed_trigger
  after update of is_done on public.cards
  for each row execute function public.notify_on_card_completed();

-- ---------------------------------------------------------------------
-- Verificação periódica de prazos
-- ---------------------------------------------------------------------
--
-- Chamada pela rota /api/automations/process (service role), junto de
-- check_overdue_cards(). Cadência:
--   card_due_soon  — uma vez por card a cada 7 dias (cobre adiamento de
--                    prazo sem repetir o aviso na virada da meia-noite)
--   card_overdue   — uma vez por card por dia, enquanto estiver vencido
--
-- Datas formatadas em America/Sao_Paulo: a empresa opera num único fuso e
-- o Brasil não tem horário de verão desde 2019.
create or replace function public.create_deadline_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card record;
  v_count integer := 0;
  v_title text;
  v_already boolean;
begin
  for v_card in
    select c.id,
           c.due_date,
           case when c.due_date < now() then 'card_overdue' else 'card_due_soon' end as kind
    from public.cards c
    where c.due_date is not null
      and c.is_archived = false
      and c.is_done = false
      and c.due_date < now() + interval '24 hours'
  loop
    if v_card.kind = 'card_overdue' then
      select exists (
        select 1 from public.notifications n
        where n.card_id = v_card.id
          and n.type = 'card_overdue'
          and n.created_at >= date_trunc('day', now())
      ) into v_already;
      v_title := 'Atividade atrasada';
    else
      select exists (
        select 1 from public.notifications n
        where n.card_id = v_card.id
          and n.type = 'card_due_soon'
          and n.created_at >= now() - interval '7 days'
      ) into v_already;
      v_title := 'Atividade vence em menos de 24 horas';
    end if;

    if v_already then
      continue;
    end if;

    v_count := v_count + public.notify_card_participants(
      v_card.id,
      v_card.kind,
      null,
      v_title,
      public.card_ref(v_card.id)
        || ' — prazo '
        || to_char(v_card.due_date at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
    );
  end loop;

  return v_count;
end;
$$;

comment on function public.create_deadline_notifications() is
  'Verificação periódica que cria notificações card_due_soon (prazo em <24h, 1x/card/7 dias) e card_overdue (vencido, 1x/card/dia) para os participantes. Chamada apenas via service role (route /api/automations/process).';

revoke all on function public.create_deadline_notifications() from public, anon, authenticated;
grant execute on function public.create_deadline_notifications() to service_role;

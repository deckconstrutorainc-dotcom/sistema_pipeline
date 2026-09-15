-- =====================================================================
-- Menções em comentários (@Nome)
--
-- Escrever "@Isabele" num comentário passa a notificar a Isabele
-- diretamente, mesmo que ela não seja responsável nem participante do
-- card — é o "chamar alguém para a conversa" que o chat resolveria, mas
-- mantido junto do assunto.
--
-- Feito por trigger, como as demais notificações: comentário vindo de
-- automação, portal ou API menciona igual ao digitado na interface.
--
-- A resolução é por NOME, não por id embutido no texto. O usuário escreve
-- livremente e o banco casa com os nomes de quem tem acesso ao card. É
-- mais tolerante e não exige um editor especial na interface; em troca,
-- nomes ambíguos (dois "Ana") notificam ambas — aceitável numa equipe
-- pequena, e melhor do que não notificar ninguém.
-- =====================================================================

/**
 * Quem foi mencionado neste texto, entre as pessoas com acesso ao card.
 *
 * Só considera membros da organização que já podem ver o card — menção
 * não concede acesso. Para trazer alguém de fora, o caminho é o convite
 * (`card_collaborators`).
 */
create or replace function public.resolve_mentions(p_card_id uuid, p_body text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id
  from public.profiles p
  join public.organization_memberships m
    on m.user_id = p.id
   and m.status = 'active'
  join public.cards c on c.id = p_card_id
  where m.organization_id = public.pipe_organization_id(c.pipe_id)
    and nullif(btrim(coalesce(p.full_name, '')), '') is not null
    -- "@" seguido do nome (ou do primeiro nome), sem diferenciar
    -- maiúsculas nem acentos. `\m` marca início de palavra, para "@Ana"
    -- não casar dentro de "@Anapaula".
    and (
      p_body ~* ('@\m' || regexp_replace(p.full_name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')
      or p_body ~* ('@\m' || regexp_replace(split_part(p.full_name, ' ', 1), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')
    );
$$;

comment on function public.resolve_mentions(uuid, text) is
  'Ids dos membros da organização mencionados com @Nome no texto e que já têm acesso ao card. Menção não concede acesso.';

revoke all on function public.resolve_mentions(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_mentions(uuid, text) to service_role;

/**
 * Notifica quem foi mencionado.
 *
 * Roda depois de `notify_on_comment`, que já avisa os participantes. Quem
 * é participante E foi mencionado receberia dois avisos — o `where` abaixo
 * evita isso, mantendo só o aviso de menção, que é mais específico.
 */
create or replace function public.notify_on_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentioned uuid[];
begin
  select array_agg(u)
    into v_mentioned
  from public.resolve_mentions(new.card_id, new.body) as u
  where u <> new.author_id
    -- Participantes já foram avisados por notify_on_comment.
    and u not in (select public.card_participants(new.card_id));

  if v_mentioned is null or array_length(v_mentioned, 1) is null then
    return new;
  end if;

  perform public.notify_users(
    new.card_id,
    v_mentioned,
    'comment_added',
    new.author_id,
    public.display_name(new.author_id) || ' mencionou você em ' || public.card_ref(new.card_id),
    left(new.body, 160)
  );

  return new;
end;
$$;

-- Nome com "z" no final para ordenar depois de notify_on_comment_trigger:
-- o Postgres dispara triggers da mesma tabela e evento em ordem
-- alfabética, e este precisa rodar por último para saber quem já foi
-- notificado.
drop trigger if exists z_notify_on_comment_mention_trigger on public.comments;
create trigger z_notify_on_comment_mention_trigger
  after insert on public.comments
  for each row execute function public.notify_on_comment_mention();

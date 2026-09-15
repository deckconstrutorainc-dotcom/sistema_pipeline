-- =====================================================================
-- Exclusão de card (permanente, restrita a admin)
--
-- Até aqui não havia policy de DELETE em `cards`: ninguém apagava, nem
-- administrador. Era deliberado — `CLAUDE.md` §22 orienta a arquivar em vez
-- de apagar histórico. Arquivar continua sendo o caminho normal e está
-- disponível a qualquer membro do pipe.
--
-- A exclusão existe para o que nunca deveria ter sido criado: card de
-- teste, duplicata, lançamento errado. Não é a forma de "concluir" uma
-- atividade.
--
-- Restrita a admin/super_admin de propósito: apagar um card cascateia em
-- 13 tabelas — valores dos campos, comentários, anexos, histórico de
-- auditoria, tarefas, e-mails, documentos gerados e conexões com cards de
-- outros setores. Um clique errado de um membro levaria embora o registro
-- de uma obra inteira, sem recuperação.
--
-- A confirmação pelo número do card acontece na interface. Aqui o que vale
-- é a regra de quem pode.
-- =====================================================================

drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards
  for delete to authenticated
  using (public.can_manage_pipe_structure(pipe_id));

comment on policy cards_delete on public.cards is
  'Exclusão permanente de card, restrita a admin/super_admin da organização (can_manage_pipe_structure). Membros comuns arquivam (cards.is_archived), não apagam: o DELETE cascateia em comentários, anexos, histórico e conexões.';

grant delete on table public.cards to authenticated;

-- ---------------------------------------------------------------------
-- Registro de auditoria da exclusão
-- ---------------------------------------------------------------------
--
-- `card_activities` cascateia junto com o card, então o histórico do card
-- apagado some com ele. Para que a exclusão em si não fique invisível,
-- registramos um `domain_event` no pipe — que sobrevive, porque referencia
-- o pipe e não o card.

-- `domain_events` restringe os tipos aceitos; `card.deleted` precisa
-- entrar na lista antes de ser emitido.
alter table public.domain_events drop constraint if exists domain_events_event_type_check;
alter table public.domain_events add constraint domain_events_event_type_check check (
  event_type in (
    'card.created',
    'card.moved',
    'card.field.updated',
    'card.overdue',
    'card.deleted',
    'phase.sla.exceeded'
  )
);

create or replace function public.log_card_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_domain_event(
    old.pipe_id,
    'card.deleted',
    'card',
    old.id,
    jsonb_build_object(
      'number', old.number,
      'title', old.title,
      'phase_id', old.current_phase_id,
      'deleted_by', auth.uid()
    )
  );
  return old;
end;
$$;

comment on function public.log_card_deletion() is
  'Registra a exclusão de um card como domain_event no pipe. Necessário porque card_activities cascateia com o card — sem isto, a exclusão não deixaria rastro nenhum.';

drop trigger if exists log_card_deletion_trigger on public.cards;
create trigger log_card_deletion_trigger
  before delete on public.cards
  for each row execute function public.log_card_deletion();

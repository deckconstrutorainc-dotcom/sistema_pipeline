-- M2 — Workflow Core
-- `move_card`: movimentação transacional de card entre fases, implementando
-- CLAUDE.md §10 passo a passo.
--
-- Por que uma função SQL `plpgsql security definer` (RPC), em vez de fazer
-- os passos em um server action com múltiplas chamadas PostgREST: um server
-- action que faz SELECT, valida, e depois UPDATE + INSERT como chamadas
-- HTTP separadas ao PostgREST NÃO tem atomicidade real entre elas — uma
-- falha entre o UPDATE e o INSERT do histórico deixaria estado parcial
-- (card movido sem registro de auditoria). Uma função Postgres roda inteira
-- em uma única transação implícita: qualquer `raise exception` reverte
-- automaticamente todo o trabalho feito até ali (o SELECT ... FOR UPDATE,
-- o UPDATE em cards e o INSERT em card_activities). Isso é exatamente a
-- garantia exigida por CLAUDE.md §10.9 ("Se houver falha, a movimentação
-- deve ser revertida").
--
-- `current_phase_id` só pode ser alterado através desta função: o trigger
-- `enforce_card_phase_change_trigger` (migration de RLS) bloqueia qualquer
-- UPDATE de `current_phase_id` que não tenha passado por aqui, usando uma
-- flag de configuração de transação (`bts.allow_phase_change`).

create or replace function public.move_card(p_card_id uuid, p_target_phase_id uuid)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards;
  v_target_phase public.phases;
  v_missing_field_label text;
  v_result public.cards;
begin
  -- 1. Autenticação
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Card não encontrado.';
  end if;

  -- 2. Autorização
  if not public.is_pipe_member(v_card.pipe_id) then
    raise exception 'Sem permissão para mover cards neste pipe.';
  end if;

  if v_card.is_archived then
    raise exception 'Não é possível mover um card arquivado.';
  end if;

  -- 3. Regras da fase de destino
  select * into v_target_phase from public.phases where id = p_target_phase_id;
  if v_target_phase.id is null or v_target_phase.pipe_id <> v_card.pipe_id then
    raise exception 'Fase de destino inválida para este pipe.';
  end if;

  if p_target_phase_id = v_card.current_phase_id then
    raise exception 'O card já está nesta fase.';
  end if;

  -- 4. Campos obrigatórios da fase de origem (bloqueia saída da fase atual
  -- se algum campo marcado como obrigatório nela estiver vazio).
  select f.label into v_missing_field_label
  from public.phase_fields pf
  join public.fields f on f.id = pf.field_id
  left join public.card_field_values cfv
    on cfv.card_id = v_card.id and cfv.field_id = pf.field_id
  where pf.phase_id = v_card.current_phase_id
    and pf.is_required = true
    and f.is_archived = false
    and (
      cfv.value is null
      or cfv.value = 'null'::jsonb
      or cfv.value = '""'::jsonb
      or cfv.value = '[]'::jsonb
    )
  limit 1;

  if v_missing_field_label is not null then
    raise exception 'Campo obrigatório não preenchido: %', v_missing_field_label;
  end if;

  -- 5. Condicionais (field_conditionals): avaliação completa de
  -- visibilidade condicional fica na camada de validação de domínio
  -- (src/lib/validation/cards.ts), reutilizada pelo formulário do card
  -- antes de permitir o preenchimento. Não há bloqueio adicional aqui no
  -- M2 além dos campos obrigatórios simples acima.

  -- 6. Atualiza a fase em transação (a própria função já roda em uma única
  -- transação implícita do Postgres — ver comentário no topo do arquivo).
  perform set_config('bts.allow_phase_change', 'true', true);

  update public.cards
    set current_phase_id = p_target_phase_id,
        is_done = v_target_phase.is_final,
        updated_at = now()
    where id = v_card.id
    returning * into v_result;

  -- 7. Histórico
  insert into public.card_activities (card_id, actor_id, type, payload)
  values (
    v_card.id,
    auth.uid(),
    'phase_changed',
    jsonb_build_object(
      'from_phase_id', v_card.current_phase_id,
      'to_phase_id', p_target_phase_id
    )
  );

  -- 8. TODO M3: enfileirar automações via domain_events (evento card.moved).

  return v_result;
end;
$$;

comment on function public.move_card(uuid, uuid) is
  'Movimentação transacional de card entre fases (CLAUDE.md §10): autentica, autoriza, valida fase de destino e campos obrigatórios da fase de origem, atualiza current_phase_id e registra card_activities — tudo em uma única transação. Ver comentário no topo do arquivo da migration para a justificativa de usar RPC em vez de múltiplas chamadas do server action.';

revoke all on function public.move_card(uuid, uuid) from public;
grant execute on function public.move_card(uuid, uuid) to authenticated;

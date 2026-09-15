-- =====================================================================
-- Correção: membro comum não conseguia criar card
--
-- Sintoma: "Não foi possível criar o card" para qualquer usuário que não
-- fosse admin da organização. Reproduzido com o usuário real de Orçamentos,
-- que recebia "Pipe inexistente para geração do número do card."
--
-- Causa: `assign_card_number()` obtém o próximo número com
--   UPDATE pipes SET next_card_number = next_card_number + 1 ... RETURNING
-- mas a função NÃO era security definer. O UPDATE passava pela RLS de
-- `pipes`, cuja policy de update exige admin/super_admin
-- (`can_manage_pipe_structure`). Para um `member`, o UPDATE não atingia
-- linha nenhuma, `v_next` vinha NULL e a função levantava a exceção — que
-- acusava um pipe inexistente quando o problema era permissão.
--
-- A policy de `cards_insert` estava certa o tempo todo: qualquer membro do
-- pipe pode criar card. Quem bloqueava era o trigger de numeração.
--
-- Correção: `security definer`. A função existe só para incrementar um
-- contador — não é ponto de decisão de autorização. Quem pode criar o card
-- já foi decidido por `cards_insert` antes de o trigger rodar; se a policy
-- recusar, o insert falha e este UPDATE é desfeito junto, na mesma
-- transação.
-- =====================================================================

create or replace function public.assign_card_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if new.number is null then
    -- security definer: o incremento do contador é mecânica interna da
    -- numeração, não uma edição do pipe pelo usuário. A autorização para
    -- criar o card é da policy cards_insert, avaliada antes daqui.
    update public.pipes
      set next_card_number = next_card_number + 1
      where id = new.pipe_id
      returning next_card_number into v_next;

    if v_next is null then
      raise exception 'Pipe % não encontrado para gerar o número do card.', new.pipe_id;
    end if;

    new.number := v_next - 1;
  end if;

  return new;
end;
$$;

comment on function public.assign_card_number() is
  'Atribui number sequencial por pipe usando pipes.next_card_number. O UPDATE em pipes serializa inserções concorrentes via lock de linha, garantindo unicidade sem sequence global. É security definer porque o incremento do contador não é uma edição do pipe pelo usuário: a autorização para criar o card vem da policy cards_insert, avaliada antes do trigger.';

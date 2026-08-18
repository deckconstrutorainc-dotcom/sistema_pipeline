-- M2 — Workflow Core
-- Policies de RLS para todas as tabelas do módulo Workflow Core, e o
-- trigger que impede alteração direta de `cards.current_phase_id` fora da
-- RPC `move_card`.
--
-- Convenção geral usada abaixo (documentada uma vez aqui para não repetir
-- em cada bloco):
--   - Leitura de estrutura (pipes, phases, fields, field_options,
--     phase_fields, field_conditionals, labels, pipe_memberships):
--     `is_pipe_member(pipe_id)` — qualquer membro autorizado do pipe.
--   - Escrita de estrutura: `can_manage_pipe_structure(pipe_id)` —
--     admin/super_admin da organização dona do pipe.
--   - Cards e tudo que pendura neles (card_field_values, card_assignments,
--     card_labels, comments, attachments): leitura e escrita por
--     `is_pipe_member(pipe_id)` — qualquer membro autorizado do pipe pode
--     operar cards (CLAUDE.md pede regra simples e documentada; refinar
--     por papel dentro do pipe fica para um milestone futuro se necessário).
--   - `card_activities`: apenas SELECT para membros do pipe. Nenhuma
--     policy de INSERT/UPDATE/DELETE para `authenticated` — a única via de
--     escrita é a função SECURITY DEFINER `log_card_activity`/`move_card`.

-- ---------------------------------------------------------------------
-- Trigger: current_phase_id só muda via move_card().
-- ---------------------------------------------------------------------

create or replace function public.enforce_card_phase_change()
returns trigger
language plpgsql
as $$
begin
  if new.current_phase_id is distinct from old.current_phase_id then
    if coalesce(current_setting('bts.allow_phase_change', true), '') <> 'true' then
      raise exception 'A fase do card só pode ser alterada através da função move_card().';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_card_phase_change() is
  'Bloqueia UPDATE direto de cards.current_phase_id via PostgREST/client. move_card() sinaliza a exceção com set_config(''bts.allow_phase_change'', ''true'', true) (escopo da transação) antes de atualizar.';

drop trigger if exists enforce_card_phase_change_trigger on public.cards;
create trigger enforce_card_phase_change_trigger
  before update on public.cards
  for each row
  execute function public.enforce_card_phase_change();

-- ---------------------------------------------------------------------
-- pipes
-- ---------------------------------------------------------------------

drop policy if exists pipes_select on public.pipes;
create policy pipes_select on public.pipes
  for select
  to authenticated
  using (public.is_pipe_member(id));

drop policy if exists pipes_insert on public.pipes;
create policy pipes_insert on public.pipes
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists pipes_update on public.pipes;
create policy pipes_update on public.pipes
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Sem policy de DELETE: pipes só são arquivados (is_archived), nunca
-- excluídos via client (CLAUDE.md §22: preservar histórico).

-- ---------------------------------------------------------------------
-- phases
-- ---------------------------------------------------------------------

drop policy if exists phases_select on public.phases;
create policy phases_select on public.phases
  for select
  to authenticated
  using (public.is_pipe_member(pipe_id));

drop policy if exists phases_insert on public.phases;
create policy phases_insert on public.phases
  for insert
  to authenticated
  with check (public.can_manage_pipe_structure(pipe_id));

drop policy if exists phases_update on public.phases;
create policy phases_update on public.phases
  for update
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id))
  with check (public.can_manage_pipe_structure(pipe_id));

drop policy if exists phases_delete on public.phases;
create policy phases_delete on public.phases
  for delete
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id));

-- Nota: excluir uma fase que ainda tem cards falha naturalmente por causa
-- da FK `cards.current_phase_id references phases(id) on delete restrict`
-- — não é necessário um trigger adicional para essa regra de negócio
-- ("excluir fase com validação", CLAUDE.md/PROMPT_MESTRE M2). O server
-- action de exclusão traduz esse erro de FK em uma mensagem amigável.

-- ---------------------------------------------------------------------
-- pipe_memberships
-- ---------------------------------------------------------------------

drop policy if exists pipe_memberships_select on public.pipe_memberships;
create policy pipe_memberships_select on public.pipe_memberships
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.can_manage_pipe_structure(pipe_id)
  );

drop policy if exists pipe_memberships_insert on public.pipe_memberships;
create policy pipe_memberships_insert on public.pipe_memberships
  for insert
  to authenticated
  with check (public.can_manage_pipe_structure(pipe_id));

drop policy if exists pipe_memberships_delete on public.pipe_memberships;
create policy pipe_memberships_delete on public.pipe_memberships
  for delete
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id));

-- ---------------------------------------------------------------------
-- fields / field_options / phase_fields / field_conditionals
-- ---------------------------------------------------------------------

drop policy if exists fields_select on public.fields;
create policy fields_select on public.fields
  for select
  to authenticated
  using (public.is_pipe_member(pipe_id));

drop policy if exists fields_insert on public.fields;
create policy fields_insert on public.fields
  for insert
  to authenticated
  with check (public.can_manage_pipe_structure(pipe_id));

drop policy if exists fields_update on public.fields;
create policy fields_update on public.fields
  for update
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id))
  with check (public.can_manage_pipe_structure(pipe_id));

-- Sem policy de DELETE: campos são arquivados (is_archived), nunca
-- excluídos (preservar histórico de card_field_values).

drop policy if exists field_options_select on public.field_options;
create policy field_options_select on public.field_options
  for select
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = field_options.field_id
        and public.is_pipe_member(f.pipe_id)
    )
  );

drop policy if exists field_options_insert on public.field_options;
create policy field_options_insert on public.field_options
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.fields f
      where f.id = field_options.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists field_options_update on public.field_options;
create policy field_options_update on public.field_options
  for update
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = field_options.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  )
  with check (
    exists (
      select 1 from public.fields f
      where f.id = field_options.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists field_options_delete on public.field_options;
create policy field_options_delete on public.field_options
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = field_options.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists phase_fields_select on public.phase_fields;
create policy phase_fields_select on public.phase_fields
  for select
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = phase_fields.field_id
        and public.is_pipe_member(f.pipe_id)
    )
  );

drop policy if exists phase_fields_insert on public.phase_fields;
create policy phase_fields_insert on public.phase_fields
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.fields f
      where f.id = phase_fields.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists phase_fields_update on public.phase_fields;
create policy phase_fields_update on public.phase_fields
  for update
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = phase_fields.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  )
  with check (
    exists (
      select 1 from public.fields f
      where f.id = phase_fields.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists phase_fields_delete on public.phase_fields;
create policy phase_fields_delete on public.phase_fields
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = phase_fields.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists field_conditionals_select on public.field_conditionals;
create policy field_conditionals_select on public.field_conditionals
  for select
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = field_conditionals.field_id
        and public.is_pipe_member(f.pipe_id)
    )
  );

drop policy if exists field_conditionals_insert on public.field_conditionals;
create policy field_conditionals_insert on public.field_conditionals
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.fields f
      where f.id = field_conditionals.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists field_conditionals_update on public.field_conditionals;
create policy field_conditionals_update on public.field_conditionals
  for update
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = field_conditionals.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  )
  with check (
    exists (
      select 1 from public.fields f
      where f.id = field_conditionals.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

drop policy if exists field_conditionals_delete on public.field_conditionals;
create policy field_conditionals_delete on public.field_conditionals
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.fields f
      where f.id = field_conditionals.field_id
        and public.can_manage_pipe_structure(f.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- labels / card_labels
-- ---------------------------------------------------------------------

drop policy if exists labels_select on public.labels;
create policy labels_select on public.labels
  for select
  to authenticated
  using (public.is_pipe_member(pipe_id));

drop policy if exists labels_insert on public.labels;
create policy labels_insert on public.labels
  for insert
  to authenticated
  with check (public.can_manage_pipe_structure(pipe_id));

drop policy if exists labels_update on public.labels;
create policy labels_update on public.labels
  for update
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id))
  with check (public.can_manage_pipe_structure(pipe_id));

drop policy if exists labels_delete on public.labels;
create policy labels_delete on public.labels
  for delete
  to authenticated
  using (public.can_manage_pipe_structure(pipe_id));

drop policy if exists card_labels_select on public.card_labels;
create policy card_labels_select on public.card_labels
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_labels.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_labels_insert on public.card_labels;
create policy card_labels_insert on public.card_labels
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cards c
      where c.id = card_labels.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_labels_delete on public.card_labels;
create policy card_labels_delete on public.card_labels
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_labels.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------

drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards
  for select
  to authenticated
  using (public.is_pipe_member(pipe_id));

drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards
  for insert
  to authenticated
  with check (
    public.is_pipe_member(pipe_id)
    and created_by = auth.uid()
  );

-- UPDATE liberado a qualquer membro autorizado do pipe (editar título,
-- prazo, arquivar/concluir, etc.) — a coluna current_phase_id continua
-- protegida pelo trigger enforce_card_phase_change_trigger acima, então
-- essa policy não abre brecha para pular move_card().
drop policy if exists cards_update on public.cards;
create policy cards_update on public.cards
  for update
  to authenticated
  using (public.is_pipe_member(pipe_id))
  with check (public.is_pipe_member(pipe_id));

-- Sem policy de DELETE: cards são arquivados (is_archived), nunca
-- excluídos via client.

-- ---------------------------------------------------------------------
-- card_field_values
-- ---------------------------------------------------------------------

drop policy if exists card_field_values_select on public.card_field_values;
create policy card_field_values_select on public.card_field_values
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_field_values.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_field_values_insert on public.card_field_values;
create policy card_field_values_insert on public.card_field_values
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cards c
      where c.id = card_field_values.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_field_values_update on public.card_field_values;
create policy card_field_values_update on public.card_field_values
  for update
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_field_values.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  )
  with check (
    exists (
      select 1 from public.cards c
      where c.id = card_field_values.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_field_values_delete on public.card_field_values;
create policy card_field_values_delete on public.card_field_values
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_field_values.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- card_assignments
-- ---------------------------------------------------------------------

drop policy if exists card_assignments_select on public.card_assignments;
create policy card_assignments_select on public.card_assignments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_assignments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_assignments_insert on public.card_assignments;
create policy card_assignments_insert on public.card_assignments
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cards c
      where c.id = card_assignments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_assignments_delete on public.card_assignments;
create policy card_assignments_delete on public.card_assignments
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_assignments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = comments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.cards c
      where c.id = comments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- Edição restrita ao próprio autor do comentário.
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Exclusão: autor do comentário ou quem gerencia a estrutura do pipe
-- (moderação).
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.cards c
      where c.id = comments.card_id
        and public.can_manage_pipe_structure(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = attachments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.cards c
      where c.id = attachments.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.cards c
      where c.id = attachments.card_id
        and public.can_manage_pipe_structure(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- card_activities
-- Somente SELECT para authenticated. Nenhuma policy de INSERT/UPDATE/
-- DELETE é criada de propósito — ver comentário no topo do arquivo e na
-- migration da tabela.
-- ---------------------------------------------------------------------

drop policy if exists card_activities_select on public.card_activities;
create policy card_activities_select on public.card_activities
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_activities.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- M4 — Data Hub
-- Policies de RLS para todas as tabelas do Data Hub.
--
-- Convenção (documentada uma vez aqui, CLAUDE.md §3/§6/§7):
--   - `databases`/`database_fields` (ESTRUTURA): leitura para qualquer
--     membro ativo da organização (`is_org_member_of_database` —
--     databases é um recurso compartilhado da organização, não restrito
--     por pipe, diferente de `fields`/pipes no M2); escrita (criar,
--     renomear, criar/editar/arquivar campo) somente admin/super_admin
--     (`can_manage_database_structure`).
--   - `records`/`record_values` (DADOS OPERACIONAIS): leitura E escrita
--     (criar/editar/arquivar registro) para qualquer membro ativo da
--     organização (`is_org_member_of_database`/`is_org_member_of_record`)
--     — decisão explícita: diferente da estrutura, o preenchimento de
--     registros é uma operação do dia a dia (ex.: cadastrar um novo
--     fornecedor, um novo equipamento), então exigir admin aqui
--     inviabilizaria o uso normal do recurso. Documentado conforme pedido
--     ("decida o nível mínimo razoável e documente").
--   - `card_record_connections`/`card_card_connections`: autorização
--     cross-tenant garantida por `can_connect_card_and_record`/
--     `can_connect_cards` (ver `20260818092400_data_hub_authz_helpers.sql`),
--     que validam is_pipe_member() E igualdade de organização — nunca
--     confiando apenas em uma das duas checagens. Reforçado por trigger
--     BEFORE INSERT (defesa em profundidade) nas migrations das tabelas.

-- ---------------------------------------------------------------------
-- databases
-- ---------------------------------------------------------------------

drop policy if exists databases_select on public.databases;
create policy databases_select on public.databases
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists databases_insert on public.databases;
create policy databases_insert on public.databases
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists databases_update on public.databases;
create policy databases_update on public.databases
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Sem policy de DELETE: databases só são arquivados (is_archived), nunca
-- excluídos via client (CLAUDE.md §22: preservar histórico).

-- ---------------------------------------------------------------------
-- database_fields
-- ---------------------------------------------------------------------

drop policy if exists database_fields_select on public.database_fields;
create policy database_fields_select on public.database_fields
  for select
  to authenticated
  using (public.is_org_member_of_database(database_id));

drop policy if exists database_fields_insert on public.database_fields;
create policy database_fields_insert on public.database_fields
  for insert
  to authenticated
  with check (public.can_manage_database_structure(database_id));

drop policy if exists database_fields_update on public.database_fields;
create policy database_fields_update on public.database_fields
  for update
  to authenticated
  using (public.can_manage_database_structure(database_id))
  with check (public.can_manage_database_structure(database_id));

-- Sem policy de DELETE: campos são arquivados (is_archived), nunca
-- excluídos (preserva histórico de record_values).

-- ---------------------------------------------------------------------
-- records
-- ---------------------------------------------------------------------

drop policy if exists records_select on public.records;
create policy records_select on public.records
  for select
  to authenticated
  using (public.is_org_member_of_database(database_id));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
  for insert
  to authenticated
  with check (
    public.is_org_member_of_database(database_id)
    and created_by = auth.uid()
  );

drop policy if exists records_update on public.records;
create policy records_update on public.records
  for update
  to authenticated
  using (public.is_org_member_of_database(database_id))
  with check (public.is_org_member_of_database(database_id));

-- Sem policy de DELETE: registros são arquivados (is_archived), nunca
-- excluídos via client.

-- ---------------------------------------------------------------------
-- record_values
-- ---------------------------------------------------------------------

drop policy if exists record_values_select on public.record_values;
create policy record_values_select on public.record_values
  for select
  to authenticated
  using (public.is_org_member_of_record(record_id));

drop policy if exists record_values_insert on public.record_values;
create policy record_values_insert on public.record_values
  for insert
  to authenticated
  with check (public.is_org_member_of_record(record_id));

drop policy if exists record_values_update on public.record_values;
create policy record_values_update on public.record_values
  for update
  to authenticated
  using (public.is_org_member_of_record(record_id))
  with check (public.is_org_member_of_record(record_id));

drop policy if exists record_values_delete on public.record_values;
create policy record_values_delete on public.record_values
  for delete
  to authenticated
  using (public.is_org_member_of_record(record_id));

-- ---------------------------------------------------------------------
-- card_record_connections
-- ---------------------------------------------------------------------

drop policy if exists card_record_connections_select on public.card_record_connections;
create policy card_record_connections_select on public.card_record_connections
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_record_connections.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_record_connections_insert on public.card_record_connections;
create policy card_record_connections_insert on public.card_record_connections
  for insert
  to authenticated
  with check (
    public.can_connect_card_and_record(card_id, record_id)
    and created_by = auth.uid()
  );

drop policy if exists card_record_connections_delete on public.card_record_connections;
create policy card_record_connections_delete on public.card_record_connections
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_record_connections.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- card_card_connections
-- ---------------------------------------------------------------------

drop policy if exists card_card_connections_select on public.card_card_connections;
create policy card_card_connections_select on public.card_card_connections
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_card_connections.card_id_a
        and public.is_pipe_member(c.pipe_id)
    )
    or exists (
      select 1 from public.cards c
      where c.id = card_card_connections.card_id_b
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists card_card_connections_insert on public.card_card_connections;
create policy card_card_connections_insert on public.card_card_connections
  for insert
  to authenticated
  with check (
    public.can_connect_cards(card_id_a, card_id_b)
    and created_by = auth.uid()
  );

drop policy if exists card_card_connections_delete on public.card_card_connections;
create policy card_card_connections_delete on public.card_card_connections
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_card_connections.card_id_a
        and public.is_pipe_member(c.pipe_id)
    )
    or exists (
      select 1 from public.cards c
      where c.id = card_card_connections.card_id_b
        and public.is_pipe_member(c.pipe_id)
    )
  );

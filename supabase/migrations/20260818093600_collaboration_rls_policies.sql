-- M5 — Colaboração Externa
-- Policies de RLS para todas as tabelas do módulo. Convenção (mesmo estilo
-- documentado em `20260818092700_data_hub_rls_policies.sql`):
--   - `portals`/`portal_items`/`email_templates` (ESTRUTURA): leitura para
--     qualquer membro ativo da organização, escrita (criar/editar) somente
--     admin/super_admin (`can_manage_portal` / `has_org_role`).
--   - `requests`: leitura só para membros da organização dona do portal —
--     a consulta pública por protocolo NUNCA passa por SELECT direto do
--     client anônimo aqui (o role `anon` não tem policy nenhuma nesta
--     tabela); ela usa exclusivamente o RPC SECURITY DEFINER
--     `get_request_status_by_protocol`.
--   - `tasks`: leitura para membros da organização (ou do pipe, quando
--     `pipe_id` setado); escrita para membro autorizado do pipe/organização
--     + o próprio assignee sempre pode atualizar (ex.: mudar status).
--   - `email_threads`/`email_messages`: leitura para membros do pipe do
--     card; ZERO policy de INSERT/UPDATE/DELETE para `authenticated` — só
--     o client administrativo (service role, usado exclusivamente em
--     server actions) escreve, prevenindo spoofing de mensagens.
--   - Nenhuma destas tabelas tem policy para o role `anon`, EXCETO através
--     dos três RPCs SECURITY DEFINER da migration anterior — RLS não é
--     bypassada por eles porque rodam com o privilégio do owner da função,
--     não do caller, e retornam apenas as colunas explicitamente
--     selecionadas ali dentro.

-- ---------------------------------------------------------------------
-- portals
-- ---------------------------------------------------------------------

drop policy if exists portals_select on public.portals;
create policy portals_select on public.portals
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists portals_insert on public.portals;
create policy portals_insert on public.portals
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists portals_update on public.portals;
create policy portals_update on public.portals
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Sem policy de DELETE: portais são desativados (is_active = false), nunca
-- excluídos via client (preserva histórico de requests).

-- ---------------------------------------------------------------------
-- portal_items
-- ---------------------------------------------------------------------

drop policy if exists portal_items_select on public.portal_items;
create policy portal_items_select on public.portal_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.portals p
      where p.id = portal_items.portal_id
        and public.is_org_member(p.organization_id)
    )
  );

drop policy if exists portal_items_insert on public.portal_items;
create policy portal_items_insert on public.portal_items
  for insert
  to authenticated
  with check (public.can_manage_portal(portal_id));

drop policy if exists portal_items_update on public.portal_items;
create policy portal_items_update on public.portal_items
  for update
  to authenticated
  using (public.can_manage_portal(portal_id))
  with check (public.can_manage_portal(portal_id));

drop policy if exists portal_items_delete on public.portal_items;
create policy portal_items_delete on public.portal_items
  for delete
  to authenticated
  using (public.can_manage_portal(portal_id));

-- ---------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.portals p
      where p.id = requests.portal_id
        and public.is_org_member(p.organization_id)
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para authenticated nem anon: a única
-- via de criação é o RPC SECURITY DEFINER submit_portal_request.

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select
  to authenticated
  using (
    (pipe_id is null and public.is_org_member(organization_id))
    or (pipe_id is not null and public.is_pipe_member(pipe_id))
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert
  to authenticated
  with check (
    (
      (pipe_id is null and public.is_org_member(organization_id))
      or (pipe_id is not null and public.is_pipe_member(pipe_id))
    )
    and created_by = auth.uid()
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update
  to authenticated
  using (
    (pipe_id is null and public.is_org_member(organization_id))
    or (pipe_id is not null and public.is_pipe_member(pipe_id))
    or assigned_to = auth.uid()
  )
  with check (
    (pipe_id is null and public.is_org_member(organization_id))
    or (pipe_id is not null and public.is_pipe_member(pipe_id))
    or assigned_to = auth.uid()
  );

-- Sem policy de DELETE: tasks são canceladas (status = 'cancelled'), nunca
-- excluídas via client.

-- ---------------------------------------------------------------------
-- email_templates
-- ---------------------------------------------------------------------

drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists email_templates_insert on public.email_templates;
create policy email_templates_insert on public.email_templates
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists email_templates_update on public.email_templates;
create policy email_templates_update on public.email_templates
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- email_threads / email_messages
-- ---------------------------------------------------------------------

drop policy if exists email_threads_select on public.email_threads;
create policy email_threads_select on public.email_threads
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = email_threads.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita somente
-- via createAdminClient() em server actions (src/server/actions/email.ts).

drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select
  to authenticated
  using (public.is_pipe_member(public.email_thread_pipe_id(thread_id)));

-- Idem: sem policy de escrita para authenticated.

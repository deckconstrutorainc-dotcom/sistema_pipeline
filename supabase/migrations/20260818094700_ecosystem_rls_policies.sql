-- M7 — Ecosystem
-- Policies de RLS para `integrations`/`webhooks`/`webhook_deliveries`
-- (`integration_credentials` já ficou deliberadamente sem NENHUMA policy —
-- ver `20260818094500_integration_credentials.sql`).
--
-- Convenção (mesma do M3, ver `20260818091900_automation_rls_policies.sql`):
--   - `integrations`: leitura para qualquer membro da organização
--     (`is_org_member`); escrita (criar/editar) somente admin/super_admin
--     (`has_org_role`). Sem policy de DELETE — integrações são desativadas
--     (`is_active = false`), nunca excluídas (preserva histórico e evita
--     quebrar `integration_credentials`/`webhooks` que referenciam a linha).
--   - `webhooks`: mesma regra de leitura/escrita de `integrations`. A
--     coluna `secret_ciphertext` é adicionalmente protegida por GRANT de
--     coluna (abaixo) — mesmo com a policy de SELECT permitindo a LINHA,
--     o valor da coluna nunca é retornado para `authenticated`/`anon`,
--     mesmo para admin. Só o `service_role` (dispatcher / rota de
--     recebimento) lê o ciphertext.
--   - `webhook_deliveries`: leitura somente admin/super_admin da
--     organização dona do webhook (observabilidade/log, CLAUDE.md §18).
--     Nenhuma policy de escrita — gravado somente por
--     `emit_domain_event()` (criação outbound), pelo dispatcher
--     (`webhook-dispatcher.ts`, via service role) e pela rota de
--     recebimento inbound (via service role).

-- ---------------------------------------------------------------------
-- integrations
-- ---------------------------------------------------------------------

drop policy if exists integrations_select on public.integrations;
create policy integrations_select on public.integrations
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists integrations_insert on public.integrations;
create policy integrations_insert on public.integrations
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
  );

drop policy if exists integrations_update on public.integrations;
create policy integrations_update on public.integrations
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- ---------------------------------------------------------------------
-- webhooks
-- ---------------------------------------------------------------------

drop policy if exists webhooks_select on public.webhooks;
create policy webhooks_select on public.webhooks
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists webhooks_insert on public.webhooks;
create policy webhooks_insert on public.webhooks
  for insert
  to authenticated
  with check (
    public.has_org_role(organization_id, array['super_admin', 'admin'])
    and created_by = auth.uid()
    and (pipe_id is null or public.pipe_organization_id(pipe_id) = organization_id)
  );

drop policy if exists webhooks_update on public.webhooks;
create policy webhooks_update on public.webhooks
  for update
  to authenticated
  using (public.has_org_role(organization_id, array['super_admin', 'admin']))
  with check (public.has_org_role(organization_id, array['super_admin', 'admin']));

-- Proteção de coluna (defesa em profundidade além da RLS de linha):
-- `secret_ciphertext` nunca é retornado para `authenticated`/`anon`, nem
-- para quem tem permissão de SELECT na linha (admin incluso). Só
-- `service_role` (bypass total) lê essa coluna — usado por
-- `webhook-dispatcher.ts` (assinar entrega outbound) e pela rota de
-- recebimento inbound (validar assinatura).
revoke select on public.webhooks from authenticated, anon;
grant select (
  id, organization_id, pipe_id, direction, url, event_types,
  is_active, created_by, created_at, updated_at
) on public.webhooks to authenticated;

-- ---------------------------------------------------------------------
-- webhook_deliveries
-- ---------------------------------------------------------------------

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.webhooks w
      where w.id = webhook_deliveries.webhook_id
        and public.has_org_role(w.organization_id, array['super_admin', 'admin'])
    )
  );

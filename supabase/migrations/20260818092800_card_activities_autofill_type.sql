-- M4 — Data Hub
-- card_activities: adiciona os tipos 'record_connected', 'record_disconnected',
-- 'card_connected', 'card_disconnected' e 'autofill_applied', usados pelos
-- server actions de `src/server/actions/connections.ts` para registrar
-- auditoria de conexão card<->record, card<->card e autofill (CLAUDE.md
-- §18/§23: mudanças críticas geram histórico). Mesmo padrão já usado em
-- `20260818091900_automation_rls_policies.sql` para adicionar
-- 'automation_action' ao mesmo constraint.

alter table public.card_activities drop constraint if exists card_activities_type_check;
alter table public.card_activities add constraint card_activities_type_check check (
  type in (
    'card_created',
    'phase_changed',
    'field_updated',
    'assigned',
    'unassigned',
    'label_added',
    'label_removed',
    'comment_added',
    'attachment_added',
    'card_archived',
    'card_unarchived',
    'card_completed',
    'automation_action',
    'record_connected',
    'record_disconnected',
    'card_connected',
    'card_disconnected',
    'autofill_applied'
  )
);

-- M5 — Colaboração Externa
-- Estende o catálogo de tipos de `card_activities` (M2) com:
--   - 'request_submitted': card criado a partir de uma solicitação externa
--     via portal, registrada pelo RPC `submit_portal_request` com
--     `actor_id = null` (origem de sistema/externa, mesma semântica
--     documentada para automações no M3).
--   - 'email_sent': e-mail outbound registrado para o card (ver
--     `src/server/actions/email.ts` -> logOutboundEmail).

alter table public.card_activities
  drop constraint if exists card_activities_type_check;

alter table public.card_activities
  add constraint card_activities_type_check check (
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
      'request_submitted',
      'email_sent'
    )
  );

comment on constraint card_activities_type_check on public.card_activities is
  'M5 adiciona os tipos request_submitted (card criado via portal) e email_sent (e-mail outbound registrado para o card).';

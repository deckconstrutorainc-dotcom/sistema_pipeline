-- M6 — Gestão e Analytics
-- Estende o catálogo de tipos de `card_activities` (M2) com
-- 'document_generated': registrado por `generateDocument`
-- (src/server/actions/documents.ts) após gerar (ou falhar ao gerar) um
-- documento a partir de um template para o card — mesmo padrão de extensão
-- incremental do catálogo já usado em M3/M4/M5
-- (`card_activities_autofill_type.sql`, `card_activities_request_type.sql`).

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
      'email_sent',
      'document_generated'
    )
  );

comment on constraint card_activities_type_check on public.card_activities is
  'M6 adiciona o tipo document_generated (documento gerado a partir de um template para o card).';

-- M2 — Workflow Core (checklist de card)
-- `checklist_items`: lista de tarefas dentro de um card, mesmo padrão de
-- `comments`/`card_labels` — leitura e escrita para qualquer membro
-- autorizado do pipe do card (`is_pipe_member` via join com `cards`), sem
-- exigir admin (CLAUDE.md §7/§9).

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_items_title_not_blank check (btrim(title) <> '')
);

comment on table public.checklist_items is
  'Item de checklist de um card (lista de tarefas simples dentro do card).';

create index if not exists checklist_items_card_id_idx
  on public.checklist_items (card_id, position, created_at);

drop trigger if exists set_checklist_items_updated_at on public.checklist_items;
create trigger set_checklist_items_updated_at
  before update on public.checklist_items
  for each row
  execute function public.set_updated_at();

alter table public.checklist_items enable row level security;

-- ---------------------------------------------------------------------
-- RLS — mesmo padrão de comments/card_labels: qualquer membro autorizado
-- do pipe do card pode ler e escrever. A policy de SELECT reconsulta
-- `cards`, NUNCA a própria `checklist_items` sendo inserida — evita o bug
-- de RLS self-reference em INSERT...RETURNING já corrigido em `pipes`
-- (ver `src/server/actions/pipes.ts`), então um INSERT seguido de
-- `.select()` aqui é seguro. Mesmo assim, validado empiricamente contra o
-- banco real antes de confiar (ver script de teste manual usado nesta
-- migration).
-- ---------------------------------------------------------------------

drop policy if exists checklist_items_select on public.checklist_items;
create policy checklist_items_select on public.checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = checklist_items.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists checklist_items_insert on public.checklist_items;
create policy checklist_items_insert on public.checklist_items
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cards c
      where c.id = checklist_items.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists checklist_items_update on public.checklist_items;
create policy checklist_items_update on public.checklist_items
  for update
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = checklist_items.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  )
  with check (
    exists (
      select 1 from public.cards c
      where c.id = checklist_items.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

drop policy if exists checklist_items_delete on public.checklist_items;
create policy checklist_items_delete on public.checklist_items
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = checklist_items.card_id
        and public.is_pipe_member(c.pipe_id)
    )
  );

-- ---------------------------------------------------------------------
-- card_activities: adiciona 'checklist_item_added' e
-- 'checklist_item_completed' (registrados por
-- `src/server/actions/checklists.ts`).
--
-- IMPORTANTE — corrige regressão encontrada ao inspecionar o constraint
-- ATUAL no banco de produção (consultado via pg_get_constraintdef antes de
-- escrever esta migration): as migrations `20260818093400` (M5) e
-- `20260818094300` (M6) recriaram `card_activities_type_check` a partir de
-- uma cópia do arquivo de origem que já estava desatualizada, e sem querer
-- DERrubaram os tipos 'automation_action' (M3), 'record_connected',
-- 'record_disconnected', 'card_connected', 'card_disconnected' e
-- 'autofill_applied' (M4) que a migration `20260818092800` havia
-- adicionado. Isso está causando falha real hoje em produção: qualquer
-- chamada a `log_card_activity` com um desses tipos (conectar/desconectar
-- card-record, card-card, aplicar autofill, ação de automação — ver
-- `src/server/actions/connections.ts` e o motor de automação do M3) viola
-- o CHECK e é rejeitada. Esta migration restaura o conjunto completo de
-- tipos já em uso pelo código, além de adicionar os dois novos de
-- checklist — nenhum tipo é removido.
-- ---------------------------------------------------------------------

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
      'automation_action',
      'record_connected',
      'record_disconnected',
      'card_connected',
      'card_disconnected',
      'autofill_applied',
      'request_submitted',
      'email_sent',
      'document_generated',
      'checklist_item_added',
      'checklist_item_completed'
    )
  );

comment on constraint card_activities_type_check on public.card_activities is
  'Conjunto completo e restaurado de tipos de atividade (ver comentário acima sobre a regressão corrigida por esta migration). Adiciona checklist_item_added e checklist_item_completed (M2 — checklist de card).';

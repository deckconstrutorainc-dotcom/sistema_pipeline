-- M4 — Data Hub
-- `database_fields`: campos dinâmicos de um database. Reaproveita
-- EXATAMENTE o mesmo catálogo de tipos usado em `public.fields` (M2, ver
-- `20260818090300_fields.sql` e `src/lib/validation/fields.ts` — a
-- constante `fieldTypes` é a fonte de verdade única para o cliente; este
-- `check` constraint é o espelho no banco, igual já é feito para `fields`).
--
-- `key`: slug estável (independente do `label`, que pode mudar) usado para
-- referenciar o campo em autofill e em integrações futuras — não é
-- possível renomear/reciclar sem quebrar mapeamentos externos, por isso é
-- imutável na prática (server actions não expõem update de `key`).
--
-- `config jsonb`: opções de seleção (single_select/multi_select) e outras
-- configurações específicas de tipo, seguindo o mesmo princípio de "não
-- criar coluna física nova por campo" (CLAUDE.md §8) — aqui aplicado à
-- própria definição do campo, não só ao valor.
--
-- `is_archived`: adicionado por consistência com `fields` (preserva
-- histórico de `record_values` já preenchido em vez de excluir a
-- definição do campo) e para suportar a action `archiveDatabaseField`.

create table if not exists public.database_fields (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  label text not null,
  key text not null,
  type text not null,
  is_required boolean not null default false,
  position integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint database_fields_label_not_blank check (btrim(label) <> ''),
  constraint database_fields_key_format check (key ~ '^[a-z0-9_]+$'),
  constraint database_fields_database_key_unique unique (database_id, key),
  constraint database_fields_type_check check (
    type in (
      'short_text',
      'long_text',
      'number',
      'currency',
      'date',
      'datetime',
      'single_select',
      'multi_select',
      'checkbox',
      'email',
      'phone',
      'user',
      'attachment'
    )
  )
);

comment on table public.database_fields is
  'Definição de campo dinâmico de um database. Mesmo catálogo de tipos de public.fields (M2).';

create index if not exists database_fields_database_id_idx
  on public.database_fields (database_id);

drop trigger if exists set_database_fields_updated_at on public.database_fields;
create trigger set_database_fields_updated_at
  before update on public.database_fields
  for each row
  execute function public.set_updated_at();

alter table public.database_fields enable row level security;

-- `title_field_id`: campo (opcional) usado para calcular `records.title`
-- automaticamente ao salvar um registro (ver comentário em `records.sql`
-- sobre a estratégia de cálculo de título). Adicionado via ALTER TABLE
-- porque referencia `database_fields`, criada depois de `databases`
-- (mesmo padrão de `pipes.start_form_phase_id` no M2).
alter table public.databases
  add column if not exists title_field_id uuid references public.database_fields (id) on delete set null;

comment on column public.databases.title_field_id is
  'Campo de database_fields usado como título do registro (records.title). Quando nulo, o título é calculado a partir do primeiro campo short_text/long_text não arquivado, por position (ver src/lib/validation/databases.ts:resolveRecordTitle).';

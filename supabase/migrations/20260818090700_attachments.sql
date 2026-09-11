-- M2 — Workflow Core
-- `attachments`: metadados de arquivos anexados a um card. O upload real
-- (Supabase Storage) não é implementado neste milestone por não haver
-- projeto Supabase configurado neste ambiente — a tabela modela o schema
-- correto para quando o Storage for conectado:
--   - bucket privado dedicado (ex.: "attachments");
--   - `storage_path` deve iniciar com `{organization_id}/{pipe_id}/{card_id}/...`
--     para isolamento multi-tenant também no path;
--   - nunca usar `file_name` original como identificador único (é só
--     metadado de exibição — o identificador real é `id`/`storage_path`);
--   - downloads exclusivamente via signed URL emitida no servidor após
--     checagem de autorização (nunca URL pública direta).

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint attachments_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint attachments_file_name_not_blank check (btrim(file_name) <> ''),
  constraint attachments_size_positive check (size_bytes > 0)
);

comment on table public.attachments is
  'Metadados de arquivo anexado a um card. Upload/download reais dependem de bucket Supabase Storage configurado (pendência de infraestrutura, fora do escopo deste milestone).';

create index if not exists attachments_card_id_idx
  on public.attachments (card_id);

alter table public.attachments enable row level security;

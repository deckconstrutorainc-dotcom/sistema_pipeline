-- M4 — Data Hub
-- `card_record_connections`: conexão card <-> record.
--
-- `field_id`: referência opcional a `public.fields` (nullable) — quando a
-- conexão é feita através de um campo do card do tipo "conexão" (não
-- implementado como tipo de campo dedicado nesta primeira versão do M4;
-- reservado para uso futuro/UI). Como `field_id` é sempre nulo nesta fase
-- (conexão feita diretamente via ação, não via um campo tipado), a unique
-- constraint é `(card_id, record_id)` — mais simples e suficiente:
-- "decida o mais simples que atenda conexão card ↔ record" — e evita o
-- problema de NULL não deduplicar em unique constraints multi-coluna.
--
-- Autorização cross-tenant: garantida em DOIS lugares independentes
-- (defesa em profundidade) — a policy de INSERT (RLS) e o trigger
-- `check_card_record_connection_authz`, ambos usando a mesma função
-- `can_connect_card_and_record` como fonte de verdade única.

create table if not exists public.card_record_connections (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  record_id uuid not null references public.records (id) on delete cascade,
  field_id uuid references public.fields (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint card_record_connections_unique unique (card_id, record_id)
);

comment on table public.card_record_connections is
  'Conexão entre um card e um record de um database. field_id é reservado para uso futuro (campo de card do tipo "conexão"); sempre nulo nesta versão.';

create index if not exists card_record_connections_card_id_idx
  on public.card_record_connections (card_id);

create index if not exists card_record_connections_record_id_idx
  on public.card_record_connections (record_id);

alter table public.card_record_connections enable row level security;

create or replace function public.check_card_record_connection_authz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_connect_card_and_record(new.card_id, new.record_id) then
    raise exception 'Não é possível conectar este card a este registro (organizações diferentes ou sem permissão).';
  end if;
  return new;
end;
$$;

comment on function public.check_card_record_connection_authz() is
  'Defesa em profundidade: reforça can_connect_card_and_record no banco, independente da policy de RLS.';

drop trigger if exists check_card_record_connection_authz_trigger on public.card_record_connections;
create trigger check_card_record_connection_authz_trigger
  before insert on public.card_record_connections
  for each row
  execute function public.check_card_record_connection_authz();

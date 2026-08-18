-- M4 — Data Hub
-- `card_card_connections`: conexão card <-> card. Relação NÃO direcionada
-- (um "link" simples entre dois cards, sem semântica de origem/destino
-- nesta primeira versão) — modelada com `card_id_a < card_id_b` sempre
-- normalizado pelo trigger abaixo (nunca confiando na ordem enviada pelo
-- client), o que evita duplicar a mesma conexão em ambos os sentidos
-- (A-B e B-A) e permite uma unique constraint simples.
--
-- Autorização cross-tenant: mesma defesa em profundidade de
-- `card_record_connections` — policy de RLS + trigger, ambos usando
-- `can_connect_cards`.

create table if not exists public.card_card_connections (
  id uuid primary key default gen_random_uuid(),
  card_id_a uuid not null references public.cards (id) on delete cascade,
  card_id_b uuid not null references public.cards (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint card_card_connections_not_self check (card_id_a <> card_id_b),
  constraint card_card_connections_ordered check (card_id_a < card_id_b),
  constraint card_card_connections_unique unique (card_id_a, card_id_b)
);

comment on table public.card_card_connections is
  'Conexão não direcionada entre dois cards. card_id_a é sempre o menor UUID dos dois (normalizado pelo trigger normalize_card_card_connection), evitando duplicar a mesma conexão nos dois sentidos.';

create index if not exists card_card_connections_card_id_a_idx
  on public.card_card_connections (card_id_a);

create index if not exists card_card_connections_card_id_b_idx
  on public.card_card_connections (card_id_b);

alter table public.card_card_connections enable row level security;

create or replace function public.normalize_card_card_connection()
returns trigger
language plpgsql
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if new.card_id_a = new.card_id_b then
    raise exception 'Não é possível conectar um card a ele mesmo.';
  end if;

  if new.card_id_a < new.card_id_b then
    v_a := new.card_id_a;
    v_b := new.card_id_b;
  else
    v_a := new.card_id_b;
    v_b := new.card_id_a;
  end if;

  new.card_id_a := v_a;
  new.card_id_b := v_b;

  return new;
end;
$$;

comment on function public.normalize_card_card_connection() is
  'Garante card_id_a < card_id_b independentemente da ordem enviada pelo client, para que a unique constraint impeça duplicar a mesma conexão nos dois sentidos.';

drop trigger if exists normalize_card_card_connection_trigger on public.card_card_connections;
create trigger normalize_card_card_connection_trigger
  before insert on public.card_card_connections
  for each row
  execute function public.normalize_card_card_connection();

create or replace function public.check_card_card_connection_authz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_connect_cards(new.card_id_a, new.card_id_b) then
    raise exception 'Não é possível conectar estes dois cards (organizações diferentes ou sem permissão).';
  end if;
  return new;
end;
$$;

comment on function public.check_card_card_connection_authz() is
  'Defesa em profundidade: reforça can_connect_cards no banco, independente da policy de RLS. Não depende da ordem de execução em relação a normalize_card_card_connection_trigger — can_connect_cards() é simétrica em (card_id_a, card_id_b), então funciona antes ou depois da normalização.';

drop trigger if exists check_card_card_connection_authz_trigger on public.card_card_connections;
create trigger check_card_card_connection_authz_trigger
  before insert on public.card_card_connections
  for each row
  execute function public.check_card_card_connection_authz();

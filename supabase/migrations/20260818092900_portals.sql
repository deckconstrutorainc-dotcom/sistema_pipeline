-- M5 — Colaboração Externa
-- `portals`: superfície pública/restrita de um pipe. Cada portal alimenta
-- exatamente um pipe (`pipe_id`) e é acessado externamente pelo `slug`
-- (único globalmente, pois vira parte da URL pública `/portal/[slug]`).
--
-- `visibility`:
--   - 'public'    : qualquer pessoa com o link pode enviar o formulário.
--   - 'restricted': exige um código de acesso simples (`access_code_hash`,
--     hash sha256 via pgcrypto — nunca guardamos o código em claro, mesma
--     postura de "nunca armazenar segredo em claro" do CLAUDE.md §10,
--     mesmo não sendo uma senha de login de verdade). Decisão de escopo
--     mínimo viável documentada na migration do RPC de submissão
--     (`20260818093500_submit_portal_request_rpc.sql`): não há convite por
--     e-mail nem controle de usuário externo autenticado neste milestone.
--
-- `access_code_hash` é a ÚNICA credencial de um portal restrito — não é
-- multiusuário, não expira e não tem RLS de nenhum tipo (é validado dentro
-- do RPC `submit_portal_request`, nunca lido por policy de SELECT do
-- client). Ver pendência de segurança documentada no relatório final.

create table if not exists public.portals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  name text not null,
  description text,
  slug text not null unique,
  visibility text not null default 'public',
  is_active boolean not null default true,
  welcome_message text,
  access_code_hash text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portals_name_not_blank check (btrim(name) <> ''),
  constraint portals_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint portals_visibility_check check (visibility in ('public', 'restricted'))
);

comment on table public.portals is
  'Portal público/restrito que alimenta um pipe específico. slug é único globalmente (URL pública /portal/[slug]). access_code_hash só é usado quando visibility = restricted (M5 — MVP: um único código compartilhado por portal, sem contas de usuário externo).';

create index if not exists portals_organization_id_idx
  on public.portals (organization_id);

create index if not exists portals_pipe_id_idx
  on public.portals (pipe_id);

drop trigger if exists set_portals_updated_at on public.portals;
create trigger set_portals_updated_at
  before update on public.portals
  for each row
  execute function public.set_updated_at();

alter table public.portals enable row level security;

-- Defesa em profundidade: garante que pipe_id pertence à MESMA organização
-- declarada em organization_id (evita um admin mal-intencionado ou um bug
-- de UI criar um portal apontando para o pipe de outro tenant).
create or replace function public.check_portal_pipe_same_org()
returns trigger
language plpgsql
as $$
declare
  v_pipe_org_id uuid;
begin
  select organization_id into v_pipe_org_id from public.pipes where id = new.pipe_id;

  if v_pipe_org_id is null then
    raise exception 'Pipe inexistente.';
  end if;

  if v_pipe_org_id <> new.organization_id then
    raise exception 'O pipe do portal deve pertencer à mesma organização do portal.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_portal_pipe_same_org_trigger on public.portals;
create trigger check_portal_pipe_same_org_trigger
  before insert or update on public.portals
  for each row
  execute function public.check_portal_pipe_same_org();

-- ---------------------------------------------------------------------
-- portal_items: quais campos do pipe aparecem no formulário público, em
-- que ordem, e se o portal EXIGE um campo que internamente é opcional.
--
-- `is_required_override`: só pode tornar um campo MAIS restritivo
-- (obrigatório no formulário externo mesmo que opcional internamente),
-- nunca menos — CLAUDE.md exige que a regra da fase interna nunca seja
-- enfraquecida pela superfície pública. Reforçado pelo check constraint
-- abaixo (só aceita null ou true) e, na validação final, pelo RPC de
-- submissão que usa `coalesce(is_required_override, phase_fields.is_required, false)`.
-- ---------------------------------------------------------------------

create table if not exists public.portal_items (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references public.portals (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  position integer not null default 0,
  is_required_override boolean,
  created_at timestamptz not null default now(),
  constraint portal_items_unique unique (portal_id, field_id),
  constraint portal_items_override_only_tightens check (
    is_required_override is null or is_required_override = true
  )
);

comment on table public.portal_items is
  'Controla quais campos do pipe aparecem no formulário público do portal e em que ordem. is_required_override só pode ENDURECER a obrigatoriedade (true), nunca afrouxá-la.';

create index if not exists portal_items_portal_id_idx
  on public.portal_items (portal_id);

alter table public.portal_items enable row level security;

-- Garante que o campo referenciado pertence ao pipe do portal (mesmo padrão
-- de check_phase_field_same_pipe / check_card_field_value_same_pipe do M2).
create or replace function public.check_portal_item_same_pipe()
returns trigger
language plpgsql
as $$
declare
  v_portal_pipe_id uuid;
  v_field_pipe_id uuid;
begin
  select pipe_id into v_portal_pipe_id from public.portals where id = new.portal_id;
  select pipe_id into v_field_pipe_id from public.fields where id = new.field_id;

  if v_portal_pipe_id is null or v_field_pipe_id is null then
    raise exception 'Portal ou campo inexistente.';
  end if;

  if v_portal_pipe_id <> v_field_pipe_id then
    raise exception 'O campo deve pertencer ao mesmo pipe do portal.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_portal_item_same_pipe_trigger on public.portal_items;
create trigger check_portal_item_same_pipe_trigger
  before insert or update on public.portal_items
  for each row
  execute function public.check_portal_item_same_pipe();

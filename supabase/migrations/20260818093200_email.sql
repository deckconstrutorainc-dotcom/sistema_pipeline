-- M5 — Colaboração Externa
-- `email_templates`, `email_threads`, `email_messages`: modelagem de e-mail
-- vinculado a card. CLAUDE.md §16: integrações usam adapters — o envio real
-- fica atrás de `EmailProvider` (`src/lib/email/provider.ts`), nunca
-- espalhado pelo domínio. Estas tabelas só guardam o REGISTRO das
-- mensagens; nenhuma delas dispara envio por si.
--
-- `email_threads`/`email_messages` NÃO possuem policy de INSERT/UPDATE/DELETE
-- para `authenticated` (ver `20260818093700_collaboration_rls_policies.sql`)
-- — mesmo padrão de `card_activities` (M2): a escrita acontece
-- exclusivamente a partir de server actions usando o client administrativo
-- (`createAdminClient()`), nunca por INSERT direto do client no navegador.
-- Isso evita spoofing de mensagens (um usuário autenticado inserindo uma
-- mensagem "inbound" fingindo ser uma resposta recebida).

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pipe_id uuid references public.pipes (id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_name_not_blank check (btrim(name) <> ''),
  constraint email_templates_subject_not_blank check (btrim(subject) <> '')
);

comment on table public.email_templates is
  'Template de e-mail reutilizável, opcionalmente associado a um pipe específico.';

create index if not exists email_templates_organization_id_idx
  on public.email_templates (organization_id);

create index if not exists email_templates_pipe_id_idx
  on public.email_templates (pipe_id);

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row
  execute function public.set_updated_at();

alter table public.email_templates enable row level security;

create or replace function public.check_email_template_pipe_same_org()
returns trigger
language plpgsql
as $$
declare
  v_pipe_org_id uuid;
begin
  if new.pipe_id is null then
    return new;
  end if;

  select organization_id into v_pipe_org_id from public.pipes where id = new.pipe_id;
  if v_pipe_org_id is null then
    raise exception 'Pipe inexistente.';
  end if;

  if v_pipe_org_id <> new.organization_id then
    raise exception 'O pipe do template deve pertencer à mesma organização do template.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_email_template_pipe_same_org_trigger on public.email_templates;
create trigger check_email_template_pipe_same_org_trigger
  before insert or update on public.email_templates
  for each row
  execute function public.check_email_template_pipe_same_org();

-- ---------------------------------------------------------------------
-- email_threads / email_messages
-- ---------------------------------------------------------------------

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  subject text not null,
  created_at timestamptz not null default now(),
  constraint email_threads_subject_not_blank check (btrim(subject) <> '')
);

comment on table public.email_threads is
  'Conversa de e-mail vinculada a um card. Escopo de organização resolvido via card_organization_id (M4).';

create index if not exists email_threads_card_id_idx
  on public.email_threads (card_id);

alter table public.email_threads enable row level security;

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  direction text not null,
  from_address text not null,
  to_addresses jsonb not null default '[]'::jsonb,
  body text not null,
  sent_at timestamptz,
  received_at timestamptz,
  status text not null default 'draft',
  provider_message_id text,
  created_at timestamptz not null default now(),
  constraint email_messages_direction_check check (direction in ('inbound', 'outbound')),
  constraint email_messages_status_check check (
    status in ('draft', 'queued', 'sent', 'failed', 'received')
  ),
  constraint email_messages_from_not_blank check (btrim(from_address) <> '')
);

comment on table public.email_messages is
  'Mensagem individual de uma thread de e-mail. Escrita somente via server (createAdminClient), nunca via INSERT direto do client — evita spoofing de mensagens inbound.';

create index if not exists email_messages_thread_id_idx
  on public.email_messages (thread_id, created_at);

alter table public.email_messages enable row level security;

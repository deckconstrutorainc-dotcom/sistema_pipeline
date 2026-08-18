-- M7 — Ecosystem
-- `integrations`: registro de conexões com serviços externos (CLAUDE.md
-- §16: "Integrações devem usar adapters" — esta tabela é a configuração
-- não-sensível de cada integração; o segredo de acesso (token/API key)
-- fica em `integration_credentials`, NUNCA nesta tabela).
--
-- `config` é jsonb (mesma diretriz de CLAUDE.md §8 usada por
-- `automations.conditions/actions` no M3) para caber configuração
-- específica de cada provider (ex.: URL de destino padrão, escopos
-- solicitados, calendário/pasta selecionada) sem precisar de uma coluna
-- física por provider. Validado na camada de aplicação
-- (`src/lib/validation/integrations.ts`) antes de gravar.
--
-- `organization_id` é explícito (não derivado de outra entidade) porque
-- uma integração não pertence a um pipe — é um recurso da organização
-- como um todo, reutilizável por múltiplos webhooks/automações no futuro.

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_provider_check check (
    provider in ('http_webhook', 'email', 'google', 'microsoft', 'e_signature')
  ),
  constraint integrations_name_not_blank check (btrim(name) <> '')
);

comment on table public.integrations is
  'Conexão com um serviço externo (CLAUDE.md §16, M7 Ecosystem). config é configuração NÃO-sensível (jsonb) — segredos vivem em integration_credentials, nunca aqui.';

create index if not exists integrations_organization_id_idx
  on public.integrations (organization_id);

drop trigger if exists set_integrations_updated_at on public.integrations;
create trigger set_integrations_updated_at
  before update on public.integrations
  for each row
  execute function public.set_updated_at();

alter table public.integrations enable row level security;

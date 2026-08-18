-- M7 — Ecosystem
-- `webhooks`: assinatura de eventos do workflow para entrega HTTP externa
-- (outbound) ou ponto de recebimento de eventos externos (inbound).
-- `pipe_id` é opcional: um webhook pode ser escopado a um pipe específico
-- (ex.: "avisar sistema X quando um card deste pipe muda de fase") ou à
-- organização inteira (`pipe_id` nulo — dispara para eventos de qualquer
-- pipe da organização cujo `event_types` bata).
--
-- `secret_ciphertext` (nullable): mesmo racional de criptografia de
-- `integration_credentials` (camada de aplicação, ver comentário naquele
-- arquivo) — usado para assinar o payload outbound (header
-- `X-BTS-Signature`, HMAC-SHA256) ou validar a assinatura de uma chamada
-- inbound. Diferente de `integration_credentials`, este campo fica na
-- MESMA tabela que os metadados do webhook (não em tabela separada)
-- porque aqui o segredo é 1:1 estrutural com o webhook (não faz sentido
-- "trocar de segredo sem trocar de webhook" da mesma forma que uma
-- integração pode rotacionar credencial independente de sua config) — e
-- porque, ao contrário de `integration_credentials`, ele nunca pode ser
-- lido por NENHUM role client mesmo como ciphertext (ver proteção de
-- coluna na migration de RLS/policies), então não há risco adicional de
-- morar na mesma tabela.

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pipe_id uuid references public.pipes (id) on delete cascade,
  direction text not null,
  url text,
  event_types text[] not null default '{}'::text[],
  secret_ciphertext text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhooks_direction_check check (direction in ('outbound', 'inbound')),
  constraint webhooks_outbound_requires_url check (direction <> 'outbound' or url is not null)
);

comment on table public.webhooks is
  'Assinatura de eventos de domínio para entrega HTTP externa (outbound) ou ponto de recebimento de eventos externos (inbound). secret_ciphertext protegido por GRANT de coluna — ver 20260818094700_ecosystem_rls_policies.sql.';

create index if not exists webhooks_organization_id_idx
  on public.webhooks (organization_id);

create index if not exists webhooks_pipe_id_idx
  on public.webhooks (pipe_id)
  where pipe_id is not null;

-- Usado pelo enfileiramento em emit_domain_event(): busca webhooks
-- outbound ativos por organização a cada evento emitido.
create index if not exists webhooks_org_direction_active_idx
  on public.webhooks (organization_id, direction)
  where is_active = true;

drop trigger if exists set_webhooks_updated_at on public.webhooks;
create trigger set_webhooks_updated_at
  before update on public.webhooks
  for each row
  execute function public.set_updated_at();

alter table public.webhooks enable row level security;

-- ---------------------------------------------------------------------
-- `webhook_deliveries`: log de entrega/recebimento (CLAUDE.md §11 "logs de
-- execução" / §18 auditoria de integração) — mesmo papel de
-- `automation_runs` (M3) só que para webhooks.
--
-- Idempotência (CLAUDE.md §11 "automações devem ser idempotentes", mesmo
-- princípio aplicado a webhooks): `unique(webhook_id, idempotency_key)`
-- espelha exatamente `unique(automation_id, idempotency_key)` de
-- `automation_runs`. Para outbound, `idempotency_key` = `domain_event_id ||
-- ':' || webhook_id` (montado em `emit_domain_event()`); para inbound,
-- montada pela rota de recebimento a partir de um identificador da
-- chamada externa (ou gerada, se o provider externo não fornecer um).
-- ---------------------------------------------------------------------

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  domain_event_id uuid references public.domain_events (id) on delete set null,
  direction text not null,
  payload jsonb not null default '{}'::jsonb,
  http_status integer,
  response_body text,
  attempt integer not null default 1,
  max_attempts integer not null default 5,
  status text not null default 'pending',
  error_message text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint webhook_deliveries_direction_check check (direction in ('outbound', 'inbound')),
  constraint webhook_deliveries_status_check check (status in ('pending', 'delivered', 'failed')),
  constraint webhook_deliveries_attempt_positive check (attempt > 0),
  constraint webhook_deliveries_max_attempts_positive check (max_attempts > 0),
  constraint webhook_deliveries_webhook_idempotency_key unique (webhook_id, idempotency_key)
);

comment on table public.webhook_deliveries is
  'Log de entrega (outbound) ou recebimento (inbound) de um webhook — mesmo papel de automation_runs (M3), com idempotência via unique(webhook_id, idempotency_key). Escrita somente via service role (dispatcher/route de recebimento).';

create index if not exists webhook_deliveries_webhook_id_idx
  on public.webhook_deliveries (webhook_id, created_at desc);

create index if not exists webhook_deliveries_status_idx
  on public.webhook_deliveries (status)
  where status = 'pending';

alter table public.webhook_deliveries enable row level security;

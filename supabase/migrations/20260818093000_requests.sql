-- M5 — Colaboração Externa
-- `requests`: registro de cada submissão pública de um portal — liga o
-- solicitante externo (sem conta no sistema) ao card criado a partir do
-- formulário, através de um protocolo legível.
--
-- Formato do protocolo: `<SLUG-ORG>-<YYYYMMDD>-<NNNN>` (ex.: `ACME-20260818-0007`),
-- sequencial por organização e por dia. Gerado dentro do RPC
-- `submit_portal_request` (migration `20260818093500_...`), nunca no
-- client — o client nunca decide o próprio protocolo. A mesma lógica de
-- formatação é espelhada em `src/lib/validation/portals.ts` (função pura
-- `formatProtocol`) só para exibição/validação de formato no frontend,
-- seguindo o mesmo padrão de espelhamento já usado para `isFieldValueEmpty`
-- (M2) — o banco continua sendo a fonte de verdade final.
--
-- `ip_hash`: nunca armazenamos o IP do solicitante em claro (privacidade —
-- CLAUDE.md §15/§25 aplicado por analogia a dados pessoais). Quando
-- capturado (rota pública, fora do escopo deste RPC), deve ser hasheado
-- antes de chegar aqui.

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references public.portals (id) on delete restrict,
  card_id uuid not null references public.cards (id) on delete cascade,
  protocol text not null unique,
  requester_name text,
  requester_email text,
  submitted_at timestamptz not null default now(),
  ip_hash text,
  constraint requests_protocol_format check (protocol ~ '^[A-Z0-9]+-[0-9]{8}-[0-9]{4,}$')
);

comment on table public.requests is
  'Submissão pública de um portal: liga o solicitante externo (sem conta) ao card criado, via protocolo legível e único. Consulta pública de status é feita exclusivamente pelo RPC get_request_status_by_protocol — nunca por SELECT direto do client anônimo nesta tabela.';

create index if not exists requests_portal_id_idx
  on public.requests (portal_id);

create index if not exists requests_card_id_idx
  on public.requests (card_id);

-- Índice de apoio à geração de protocolo sequencial por organização/dia
-- (usado pelo RPC de submissão para contar quantas requests já existem no
-- dia corrente daquela organização).
create index if not exists requests_portal_submitted_at_idx
  on public.requests (portal_id, submitted_at);

alter table public.requests enable row level security;

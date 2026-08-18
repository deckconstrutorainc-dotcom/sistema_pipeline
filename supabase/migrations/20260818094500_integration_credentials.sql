-- M7 — Ecosystem
-- `integration_credentials`: segredo (token/API key/client secret) de uma
-- integração, SEMPRE criptografado antes de chegar ao banco (CLAUDE.md
-- §3.10 "nunca exponha... credenciais administrativas" — a mesma
-- disciplina se aplica a qualquer segredo de terceiro, não só à
-- service role key).
--
-- DECISÃO DE CRIPTOGRAFIA (documentada — ver relatório final do M7 para o
-- racional completo): a criptografia acontece na CAMADA DE APLICAÇÃO
-- (`src/lib/crypto/secret-encryption.ts`, Node `crypto`, AES-256-GCM, chave
-- vinda de `ENCRYPTION_KEY` — variável de ambiente server-only, nunca
-- commitada), não no banco via `pgcrypto`/`current_setting`. Motivo:
-- Supabase hospedado não expõe um jeito de setar
-- `ALTER DATABASE ... SET app.encryption_key` a partir de uma migration
-- versionada sem commitar a chave em texto (o que violaria a própria regra
-- que se está tentando cumprir) — a chave precisaria ser configurada fora
-- do controle de versão de qualquer forma. Fazendo a cripto em TypeScript
-- server-only, a chave nunca aparece em SQL versionado, o código é
-- testável sem banco (`tests/unit/webhook-signature.test.ts` cobre a
-- assinatura HMAC; a cripto de segredo em si é testada indiretamente pela
-- action `storeCredential`, que nunca é exercida sem banco real — ver
-- pendência no relatório final) e a coluna aqui é só `text` opaco. Uma
-- migration futura pode adotar `pgp_sym_encrypt`/`current_setting` como
-- camada adicional (defesa em profundidade) se um KMS gerenciado pelo
-- Supabase (Vault) for adotado — não implementado aqui.
--
-- `secret_last_four` existe SÓ para exibição ("****1234") — nunca é usado
-- para reconstruir o segredo, é puramente cosmético e pode ser nulo se o
-- segredo tiver menos de 4 caracteres.
--
-- 1:1 com `integrations` (unique em integration_id): rotação é um UPSERT
-- (mesmo id de integração, novo ciphertext, `rotated_at` atualizado)
-- executado exclusivamente pela server action `storeCredential` via client
-- ADMIN (service role) — nunca pelo client autenticado comum. Não guarda
-- histórico de segredos antigos (CLAUDE.md §22 não exige isso para
-- segredos, ao contrário de dados de negócio) — só o segredo ATIVO no
-- momento.
--
-- RLS: ver comentário logo abaixo — a tabela fica com RLS habilitada e
-- ZERO policies, exatamente o padrão já usado por `jobs` (M3): isso torna
-- a tabela COMPLETAMENTE inacessível para os roles `anon` e `authenticated`
-- (nem SELECT, nem para admin/super_admin da organização) — só o
-- `service_role` (que faz bypass de RLS) consegue ler/escrever. A UI nunca
-- lê esta tabela diretamente; usa a action `getCredentialLastFour`, que
-- roda no servidor com o client admin e retorna só `secret_last_four`.

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations (id) on delete cascade,
  secret_ciphertext text not null,
  secret_last_four text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint integration_credentials_integration_id_key unique (integration_id)
);

comment on table public.integration_credentials is
  'Segredo (já criptografado na aplicação, AES-256-GCM, antes de chegar aqui) de uma integração. RLS habilitada sem NENHUMA policy: inacessível a anon/authenticated (nem admin), acessível somente via service_role. Ver comentário no topo do arquivo para o racional completo de criptografia.';

create index if not exists integration_credentials_integration_id_idx
  on public.integration_credentials (integration_id);

drop trigger if exists set_integration_credentials_updated_at on public.integration_credentials;
create trigger set_integration_credentials_updated_at
  before update on public.integration_credentials
  for each row
  execute function public.set_updated_at();

alter table public.integration_credentials enable row level security;

-- Nenhuma policy é criada de propósito (mesmo padrão de `jobs.sql`, M3):
-- com RLS habilitada e zero policies, a tabela fica inacessível para
-- `anon`/`authenticated`, inclusive para admin/super_admin da organização.
-- Só o `service_role` (usado exclusivamente pelas server actions
-- `storeCredential`/`getIntegrationCredentialLastFour`, nunca por código
-- que rode no navegador) consegue ler ou escrever.

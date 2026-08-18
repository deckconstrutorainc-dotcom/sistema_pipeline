/**
 * Harness de banco de dados para os testes de integração — um Postgres
 * REAL (compilado para WASM via `@electric-sql/pglite`), rodando em
 * processo Node puro, sem Docker e sem projeto Supabase remoto.
 *
 * OBJETIVO (CLAUDE.md §6/§7): até esta suíte existir, "RLS foi só revisada
 * estaticamente" — nenhuma migration nunca tinha rodado contra um Postgres
 * de verdade. Este harness aplica as migrations versionadas do projeto
 * (`supabase/migrations/*.sql`) e o seed (`supabase/seed.sql`) contra uma
 * instância nova de PGlite, e permite trocar de "usuário autenticado"/
 * "anon"/"service_role" dentro do teste para exercitar as RLS policies de
 * verdade (não apenas lidas, executadas).
 *
 * ---------------------------------------------------------------------
 * O QUE É "BASELINE SUPABASE" (NÃO é schema nosso, não vai para
 * supabase/migrations/)
 * ---------------------------------------------------------------------
 * Um projeto Supabase real provisiona, por fora do que aparece em
 * `supabase/migrations/`, uma série de objetos de infraestrutura da
 * própria plataforma antes de qualquer migration do projeto rodar:
 *   - o schema `auth` e a tabela `auth.users` (gerenciados pelo GoTrue);
 *   - a função `auth.uid()` (na prática implementada em C, lendo o JWT da
 *     sessão PostgREST — aqui é um STUB SQL simples que lê uma GUC de
 *     sessão, ver `setUserContext` abaixo);
 *   - os roles `anon`, `authenticated`, `service_role` (e `postgres`,
 *     `supabase_admin` etc., que não usamos aqui);
 *   - `service_role` com `bypassrls` (é assim que o client administrativo
 *     do Supabase — `SUPABASE_SERVICE_ROLE_KEY` — ignora todas as RLS
 *     policies);
 *   - GRANTs automáticos: toda tabela nova criada no schema `public`
 *     recebe privilégios de tabela (SELECT/INSERT/UPDATE/DELETE/...) para
 *     `anon`/`authenticated`/`service_role` via
 *     `ALTER DEFAULT PRIVILEGES` — é ISSO que permite que uma policy RLS
 *     chegue a ser avaliada; sem o GRANT de tabela, a query já seria
 *     recusada por falta de privilégio ANTES da RLS entrar em jogo. As
 *     migrations deste projeto NUNCA fazem `grant` explícito em tabela
 *     (só em função), exatamments porque no Supabase real isso já vem
 *     coberto — por isso replicar esse comportamento aqui é a parte mais
 *     importante de fidelidade ao ambiente real (sem isso, TODA a suíte
 *     de RLS falharia com "permission denied for table X", mascarando
 *     completamente o que as policies realmente fazem).
 *
 * Todo esse bloco é criado ANTES de rodar `supabase/migrations/*.sql` —
 * exatamente como acontece num projeto Supabase real, onde esses objetos
 * já existem quando a primeira migration do projeto roda.
 *
 * ---------------------------------------------------------------------
 * LIMITAÇÃO DE FIDELIDADE ENCONTRADA E CONTORNADA NESTE HARNESS
 * ---------------------------------------------------------------------
 * `@electric-sql/pglite` 0.5.5 tem uma particularidade (reproduzida com um
 * schema mínimo, isolada de qualquer código deste projeto) no mecanismo de
 * "WITH CHECK" de RLS: quando um role SEM bypassrls (`authenticated`/
 * `anon`) executa um `INSERT ... RETURNING` numa tabela cuja policy de
 * SELECT invoca uma função (`SECURITY DEFINER` ou não, `STABLE` ou não —
 * testado nas duas variações) que consulta de volta a própria tabela (o
 * padrão usado em TODAS as policies deste projeto, ex.: `is_pipe_member`
 * consultando `pipes`), o Postgres real aceitaria a linha (a policy de
 * SELECT enxerga a linha recém-inserida dentro do mesmo comando), mas o
 * PGlite recusa com "new row violates row-level security policy", mesmo
 * com o `WITH CHECK` da policy de INSERT batendo `true` isoladamente.
 * `UPDATE ... RETURNING` NÃO tem esse problema (testado e confirmado) — só
 * `INSERT ... RETURNING`. Isso é o que faria, por exemplo, o equivalente a
 * `supabaseClient.from("pipes").insert({...}).select().single()` (o padrão
 * usado por TODOS os testes de integração HTTP deste repositório) falhar
 * aqui por um artefato do ambiente de teste, não por um bug real de RLS.
 *
 * CONTORNO: `insertReturning()` abaixo NUNCA usa `INSERT ... RETURNING`
 * diretamente quando o role atual pode estar sujeito a RLS. Em vez disso:
 *   1. gera um `id` (uuid) no lado do client quando não informado;
 *   2. executa um `INSERT` simples (sem `RETURNING`);
 *   3. executa um `SELECT ... WHERE id = $1` separado, como uma segunda
 *      instrução independente.
 * Isso reproduz fielmente a semântica de `.insert().select().single()" do
 * PostgREST (inclusive validando a policy de SELECT como uma checagem real
 * e independente) sem esbarrar na particularidade acima. `service_role`
 * (bypassrls) não é afetado por essa particularidade (confirmado), mas
 * `insertReturning()` usa o mesmo caminho para todos os roles, por
 * simplicidade e consistência.
 *
 * ---------------------------------------------------------------------
 * O QUE ESTE HARNESS NÃO COBRE (ver relatório final da tarefa)
 * ---------------------------------------------------------------------
 *   - PostgREST (tradução HTTP de erros/RLS/RPC em status codes);
 *   - GoTrue (signup/login real, JWT real — `auth.uid()` aqui é um stub);
 *   - Supabase Storage (upload/download de anexos);
 *   - `pg_net`/Realtime/Edge Functions;
 *   - qualquer código de serviço (`src/server/services/*`) que dependa do
 *     client `@supabase/supabase-js` (`createAdminClient()`), porque esse
 *     client fala HTTP/PostgREST — não há PostgREST na frente do PGlite.
 *     Isso afeta especificamente `processAutomationRun()` (M3) e
 *     `processWebhookDelivery()` (M7): a CRIAÇÃO de automation_runs/
 *     webhook_deliveries pelos triggers de banco é 100% testada aqui; a
 *     EXECUÇÃO dessas funções TypeScript continua exercitada apenas pelo
 *     modo HTTP (`TEST_SUPABASE_URL`) dos respectivos arquivos de teste.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// tests/integration/setup -> raiz do projeto
const PROJECT_ROOT = path.resolve(dirname, "..", "..", "..");
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "supabase", "migrations");
const SEED_PATH = path.join(PROJECT_ROOT, "supabase", "seed.sql");

/** Papéis de banco que este harness sabe simular (subconjunto do que o Supabase provisiona). */
export type TestRole = "anon" | "authenticated" | "service_role";

/**
 * Extensões que as migrations deste projeto NÃO usam (confirmado via
 * grep em `supabase/migrations/`) e que, por isso, não precisam estar
 * disponíveis no PGlite: `uuid-ossp` (todo `default` de PK usa
 * `gen_random_uuid()`, nativo do Postgres 13+) e `pg_trgm`. Documentado
 * aqui só para deixar explícito que a ausência dessas extensões no PGlite
 * não é uma limitação relevante para este schema.
 */
export const UNUSED_EXTENSIONS_CONFIRMED = ["uuid-ossp", "pg_trgm"] as const;

/** Lista (ordenada) dos arquivos de migration aplicados — útil para asserções/relatório. */
export function listMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Cria uma instância nova de PGlite, aplica o baseline gerenciado pelo
 * Supabase (ver comentário no topo do arquivo), depois TODAS as migrations
 * versionadas do projeto em ordem, depois `supabase/seed.sql`.
 *
 * Lança um erro claro (arquivo + erro completo do Postgres) se qualquer
 * migration falhar — nunca engole erros silenciosamente.
 */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });

  await db.exec(`create extension if not exists "pgcrypto";`);

  // --- Baseline gerenciado pelo Supabase (ver cabeçalho do arquivo) -----

  await db.exec(`create schema if not exists auth;`);

  // Colunas mínimas de auth.users realmente referenciadas por
  // supabase/migrations/ (conferido via grep):
  //   - id: toda FK `references auth.users (id)`;
  //   - email: usado por `find_user_id_by_email` (20260817090900);
  //   - raw_user_meta_data: usado por `handle_new_user()` (20260817090200)
  //     para popular full_name/avatar_url do profile automático.
  await db.exec(`
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  // Stub de auth.uid(): no Supabase real isso é resolvido a partir do JWT
  // validado pelo PostgREST/GoTrue; aqui lemos uma GUC de sessão que os
  // helpers runAsUser/runAsAnon/runAsService (abaixo) manipulam.
  await db.exec(`
    create function auth.uid() returns uuid
    language sql stable
    as $$
      select nullif(current_setting('app.test_user_id', true), '')::uuid
    $$;
  `);

  await db.exec(`create schema if not exists extensions;`);

  await db.exec(`create role anon;`);
  await db.exec(`create role authenticated;`);
  await db.exec(`create role service_role;`);
  // No Supabase real, o client criado com SUPABASE_SERVICE_ROLE_KEY ignora
  // toda RLS — é exatamente isso que `bypassrls` replica.
  await db.exec(`alter role service_role bypassrls;`);

  // authenticated/anon precisam conseguir chamar auth.uid() diretamente
  // (não só de dentro de funções SECURITY DEFINER): várias policies deste
  // projeto usam `created_by = auth.uid()` inline na própria expressão da
  // policy (ex.: `pipes_insert`), o que exige USAGE no schema `auth` e
  // EXECUTE na função para o role QUE ESTÁ RODANDO A QUERY, não apenas
  // para o dono da função. No Supabase real isso já vem concedido de
  // fábrica; aqui replicamos explicitamente (achado deste harness: sem
  // isso, toda policy que referencia `auth.uid()` diretamente falha com
  // "permission denied for schema auth", mascarando o comportamento real
  // da RLS).
  await db.exec(`grant usage on schema auth to anon, authenticated, service_role;`);
  await db.exec(`grant execute on function auth.uid() to anon, authenticated, service_role;`);

  // ---------------------------------------------------------------------
  // O PONTO MAIS IMPORTANTE DE FIDELIDADE AO AMBIENTE REAL:
  //
  // As migrations deste projeto (supabase/migrations/*.sql) NUNCA fazem
  // `grant` explícito em nenhuma tabela — só em funções (RPCs). Isso
  // porque, num projeto Supabase real, TODA tabela nova do schema
  // `public` já nasce com privilégios concedidos a `anon`/`authenticated`/
  // `service_role` automaticamente, via `ALTER DEFAULT PRIVILEGES`
  // configurado pela própria plataforma antes de qualquer migration do
  // projeto rodar. Sem isso, um `GRANT` nunca aconteceria para essas
  // tabelas e TODA operação a partir de `authenticated`/`anon` falharia
  // com "permission denied for table X" — um erro de PRIVILÉGIO SQL, that
  // acontece ANTES da Row Level Security sequer ser avaliada, mascarando
  // completamente se as policies de RLS em si estão corretas.
  //
  // Por isso este `ALTER DEFAULT PRIVILEGES` roda ANTES das migrations do
  // projeto: toda tabela criada a partir daqui já nasce com o GRANT,
  // reproduzindo o comportamento real do Supabase.
  // ---------------------------------------------------------------------
  await db.exec(`
    alter default privileges in schema public
      grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on functions to anon, authenticated, service_role;
  `);
  await db.exec(`grant usage on schema public to anon, authenticated, service_role;`);

  // --- Migrations versionadas do projeto (supabase/migrations/) ---------

  const files = listMigrationFiles();
  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, "utf-8");
    try {
      await db.exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[pglite-supabase] Falha ao aplicar a migration "${file}":\n${message}\n\n` +
          `SQL da migration (para diagnóstico):\n${sql}`,
        { cause: err },
      );
    }
  }

  // --- Seed de desenvolvimento (supabase/seed.sql) -----------------------
  try {
    const seedSql = fs.readFileSync(SEED_PATH, "utf-8");
    await db.exec(seedSql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[pglite-supabase] Falha ao aplicar supabase/seed.sql:\n${message}`, { cause: err });
  }

  return db;
}

/**
 * Cria um usuário em `auth.users` (equivalente de teste a
 * `admin.auth.admin.createUser()`), retornando seu id. Não passa por
 * GoTrue (sem senha, sem confirmação de e-mail) — ver limitações no
 * cabeçalho do arquivo.
 */
export async function createAuthUser(db: PGlite, email: string): Promise<string> {
  const result = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  const row = result.rows[0];
  if (!row) throw new Error(`[pglite-supabase] Falha ao criar auth.users para ${email}.`);
  return row.id;
}

async function resetSessionContext(db: PGlite): Promise<void> {
  await db.exec(`reset role;`);
  await db.query(`select set_config('app.test_user_id', '', false)`);
}

/**
 * Executa `fn` como o usuário autenticado `userId`: `set role
 * authenticated` + `app.test_user_id` = userId (via `set_config(...,
 * false)`, sessão inteira — não `local`/transação, porque cada chamada do
 * PGlite não abre uma transação explícita própria por padrão, e várias
 * chamadas subsequentes de `fn` precisam enxergar o mesmo contexto).
 * Sempre restaura o role/contexto original no `finally`, mesmo se `fn`
 * lançar.
 */
export async function runAsUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('app.test_user_id', $1, false)`, [userId]);
  try {
    return await fn();
  } finally {
    await resetSessionContext(db);
  }
}

/** Executa `fn` como `service_role` (bypassa RLS — client administrativo do Supabase). */
export async function runAsService<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role service_role;`);
  try {
    return await fn();
  } finally {
    await resetSessionContext(db);
  }
}

/** Executa `fn` como `anon` (sem sessão — visitante público, ex.: submissão de portal). */
export async function runAsAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon;`);
  try {
    return await fn();
  } finally {
    await resetSessionContext(db);
  }
}

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

function assertSafeIdentifier(name: string): void {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(`[pglite-supabase] Identificador inseguro/inesperado: "${name}".`);
  }
}

/**
 * INSERT seguido de SELECT separado — equivalente a
 * `supabaseClient.from(table).insert(values).select().single()`, sem
 * esbarrar na particularidade de INSERT+RETURNING do PGlite descrita no
 * cabeçalho do arquivo. Gera `id` no client quando `values.id` não é
 * informado. Lança se a linha não existir/não for visível para o role
 * atual após o insert (equivalente ao PostgREST retornar 0 linhas).
 */
export async function insertReturning<T extends Record<string, unknown> = Record<string, unknown>>(
  db: PGlite,
  table: string,
  values: Record<string, unknown>,
): Promise<T> {
  assertSafeIdentifier(table);
  const withId: Record<string, unknown> = { id: values["id"] ?? randomUUID(), ...values };
  const columns = Object.keys(withId);
  columns.forEach(assertSafeIdentifier);

  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const params = columns.map((c) => withId[c]);

  await db.query(`insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")})`, params);

  const result = await db.query<T>(`select * from ${table} where id = $1`, [withId["id"]]);
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `[pglite-supabase] insertReturning: linha inserida em "${table}" não é visível para o role atual ` +
        `(RLS de SELECT bloqueou, ou o insert falhou silenciosamente).`,
    );
  }
  return row;
}

/** Helper de conveniência: roda uma query parametrizada e retorna as linhas (sem trocar de role). */
export async function rows<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

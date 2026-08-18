# ADR 0003 — Harness de testes de integração via PGlite (Postgres real sem Docker)

- **Status**: Aceita
- **Data**: 2026-08-18
- **Milestone**: transversal (valida M1–M8)

## Contexto

Todos os relatórios de milestone anteriores (M1–M8) repetiam a mesma pendência: nenhuma
migration de `supabase/migrations/` jamais tinha rodado contra um Postgres real. RLS
(CLAUDE.md §6/§7 — "testes de RLS devem usar no mínimo dois tenants") tinha sido revisada
apenas estaticamente (leitura do SQL), nunca executada. Os arquivos
`tests/integration/*.test.ts` continham a lógica de asserção completa, mas todos com
`describe.skipIf(!hasLocalSupabase)`, porque `supabase start` (Docker + Supabase CLI) não
está disponível neste ambiente de execução.

## Decisão

Adotar `@electric-sql/pglite` (Postgres compilado para WASM, roda em processo Node puro)
como motor de banco para os testes de integração, com um harness dedicado
(`tests/integration/setup/pglite-supabase.ts`) que:

1. Replica manualmente o **baseline gerenciado pelo Supabase** que normalmente já existe
   num projeto real antes de qualquer migration do projeto rodar: schema `auth` +
   `auth.users` (colunas mínimas realmente referenciadas pelas migrations), um stub SQL de
   `auth.uid()` (lê uma GUC de sessão em vez de validar um JWT real), os roles
   `anon`/`authenticated`/`service_role` (`service_role` com `bypassrls`), e — o ponto mais
   importante — `ALTER DEFAULT PRIVILEGES` replicando os GRANTs de tabela que o Supabase
   real aplica automaticamente a cada tabela nova do schema `public` (nossas migrations
   nunca fazem `grant` de tabela explícito, só de função, porque no Supabase real isso
   nunca foi necessário).
2. Roda **todas** as migrations versionadas de `supabase/migrations/*.sql`, em ordem, uma
   por vez, com erro explícito (arquivo + mensagem completa do Postgres) se alguma falhar.
3. Roda `supabase/seed.sql`.
4. Expõe `runAsUser`/`runAsService`/`runAsAnon` (troca de role + `set_config` de
   `app.test_user_id` via GUC de sessão) para exercitar RLS como cada ator real.

Cada arquivo de teste de integração passou a ter **dois modos coexistindo no mesmo
arquivo**: um `describe(...)` que roda sempre (PGlite, sem nenhuma variável de ambiente) e
um `describe.skipIf(!hasLocalSupabase)(...)` que continua existindo e cobrindo o que só um
Supabase local real (HTTP/PostgREST/GoTrue) cobre.

## Achados desta validação (motivo pelo qual esta decisão paga por si mesma)

Rodar as migrations contra um Postgres de verdade pela primeira vez encontrou, de
imediato, duas lacunas reais que a revisão estática do SQL nunca teria pego:

- Nenhuma migration concede `usage` no schema `auth` nem `execute` em `auth.uid()` para
  `anon`/`authenticated`/`service_role`. Várias policies chamam `auth.uid()` diretamente
  na própria expressão (não só indireto via função `SECURITY DEFINER`) — sem esse GRANT,
  toda policy que faz isso falharia com "permission denied for schema auth" antes mesmo de
  a lógica de RLS em si ser avaliada. No Supabase real isso já vem concedido de fábrica; o
  harness precisou replicar explicitamente (documentado extensivamente no próprio arquivo).
- Confirmação de que, sem `ALTER DEFAULT PRIVILEGES`, nenhuma tabela de negócio seria
  sequer acessível a `authenticated`/`anon` (erro de privilégio SQL, nem chega a RLS) —
  validando que a ausência de `grant` explícito nas migrations do projeto é proposital e
  correta (é coberta pela plataforma), não um bug.

## Limitação de fidelidade encontrada e contornada

`@electric-sql/pglite` 0.5.5 recusa `INSERT ... RETURNING` (não `UPDATE ... RETURNING`,
nem chamadas de RPC) quando o role atual está sujeito a RLS e a policy de `SELECT` da
tabela invoca uma função que consulta de volta a própria tabela — padrão usado em
praticamente todas as tabelas do projeto (`is_pipe_member`, `is_org_member` etc.).
Reproduzido isoladamente com um schema mínimo, sem nenhum código deste projeto envolvido,
logo é uma particularidade do PGlite, não um bug de RLS real. Contorno: `insertReturning()`
no harness nunca usa `RETURNING` — insere e faz um `SELECT` separado, reproduzindo
fielmente a semântica de `.insert().select().single()` do PostgREST.

## Alternativas consideradas

- **Continuar só com skip e a suíte HTTP**: rejeitado — é exatamente a pendência que esta
  ADR resolve; nunca validaria nada contra um Postgres real neste ambiente.
- **Instalar Docker/Supabase CLI no ambiente de execução**: indisponível neste ambiente
  (restrição de infraestrutura, não de código).
- **Mockar o client Supabase em vez de rodar SQL real**: rejeitado — mocks não validam
  migrations nem RLS de verdade (CLAUDE.md §15/§16 — mock não é implementação final
  quando existe persistência real; o mesmo princípio se aplica a testes de RLS).

## Consequências

- O modo PGlite roda sempre, em qualquer máquina/CI, sem infraestrutura externa — é o novo
  piso mínimo de confiança em RLS/migrations deste projeto.
- O modo HTTP continua existindo e sendo o único caminho para validar PostgREST, GoTrue
  (login real via JWT) e Storage — nenhum dos dois modos substitui o outro.
- Código de serviço que fala `@supabase/supabase-js` diretamente (`processAutomationRun`,
  `processWebhookDelivery`) não pode ser exercitado contra o PGlite (não há PostgREST na
  frente dele) — permanece coberto só pelo modo HTTP; os testes de integração desses dois
  arquivos documentam essa fronteira de escopo explicitamente.
- `@electric-sql/pglite` entra como devDependency (não afeta o bundle de produção).

## Referências

- `CLAUDE.md` §6, §7, §19.
- `tests/integration/setup/pglite-supabase.ts` (documentação completa inline).
- `tests/integration/rls-tenant-isolation.test.ts`, `workflow-tenant-isolation.test.ts`,
  `data-hub-isolation.test.ts`, `portal-submission.test.ts`, `reports-isolation.test.ts`,
  `automation-flow.test.ts`, `webhook-delivery.test.ts`, `ai-agent-flow.test.ts`.

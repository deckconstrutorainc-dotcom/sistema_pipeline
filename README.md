# BTS Pipe

Plataforma independente de gestão de processos e workflows (inspirada
funcionalmente em ferramentas como Pipefy, com identidade, arquitetura e
código próprios). Ver `CLAUDE.md` para regras de desenvolvimento e
`docs/architecture` / `docs/adr` para decisões de arquitetura.

Estado atual: **M0–M8 implementados** (roadmap completo do `CLAUDE.md` §22):
Fundação (M0), Segurança e Tenant (M1), Workflow Core — pipes/cards/kanban
(M2), Automação (M3), Data Hub (M4), Colaboração Externa — portais (M5),
Gestão e Analytics — relatórios/dashboards/documentos (M6), Ecosystem —
integrações/webhooks (M7) e Intelligence — agentes de IA/tools
autorizadas/human-in-the-loop (M8). Todas as migrations e as RLS policies são
validadas de verdade contra um Postgres real via `@electric-sql/pglite`
(WASM, sem Docker — ver `tests/integration/setup/pglite-supabase.ts` e ADR
`docs/adr/0003-pglite-integration-test-harness.md`), rodando por padrão em
`npm run test`. Um modo HTTP opcional (Supabase local real via
`supabase start`) continua disponível e cobre o que o PGlite não cobre
(PostgREST, GoTrue, Storage) — ver cabeçalho de cada
`tests/integration/*.test.ts`.

## Requisitos

- Node.js 20+
- Uma instância Supabase (URL + anon key). Para build/lint/typecheck locais
  sem Supabase configurado, valores placeholder em `.env.local` são
  suficientes; funcionalidades que dependem de dados reais precisarão de um
  projeto Supabase válido.

## Como rodar localmente

```bash
npm install
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Acesse http://localhost:3000.

## Scripts

| Script                | Descrição                              |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Sobe o servidor de desenvolvimento      |
| `npm run build`        | Build de produção                       |
| `npm run start`        | Roda o build de produção                |
| `npm run lint`         | ESLint                                  |
| `npm run typecheck`    | `tsc --noEmit`                          |
| `npm run test`         | Testes unitários (Vitest)               |
| `npm run test:e2e`     | Testes E2E (Playwright)                 |
| `npm run format`       | Formata o código com Prettier           |

## Estrutura

Ver seção 5 do `CLAUDE.md` para a árvore de diretórios completa e as regras
de organização por domínio (`src/features`, `src/server`, `src/lib`, etc.).

## Variáveis de ambiente

Ver `.env.example`. **Nunca** exponha `SUPABASE_SERVICE_ROLE_KEY` no
navegador — ela deve ser usada apenas em código server-side.

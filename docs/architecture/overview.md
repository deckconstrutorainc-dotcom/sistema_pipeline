# Visão geral da arquitetura — BTS Pipe

## Objetivo

Plataforma multi-tenant de gestão de processos e workflows, organizada em
milestones incrementais (ver `CLAUDE.md`, seção 22). Este documento cobre a
fundação técnica estabelecida no milestone **M0**.

## Stack

- **Frontend**: Next.js (App Router) + React + TypeScript strict + Tailwind
  CSS + componentes próprios no padrão shadcn/ui + React Hook Form + Zod +
  dnd-kit (a partir de M2, para o Kanban).
- **Backend/dados**: Supabase (PostgreSQL, Auth, Storage, Row Level
  Security).
- **Deploy**: Vercel (aplicação) + Supabase (banco/auth/storage).
- **Testes**: Vitest (unitário/integração) + Playwright (E2E).
- **Qualidade**: ESLint, Prettier, TypeScript strict, CI em pull requests.

## Estrutura de diretórios

```text
src/
  app/            # rotas (App Router), route groups (auth) e (app), api/
  components/     # UI reutilizável (ui/, layout/, forms/, kanban/, cards/, reports/)
  features/       # lógica de domínio por feature (auth, pipes, cards, automations, ...)
  lib/            # infraestrutura transversal (supabase, auth, permissions, events, jobs, ...)
  server/         # camada server-only (services, repositories, actions, queries)
  types/          # tipos compartilhados
supabase/
  migrations/     # migrations versionadas do schema
  seed.sql
  functions/      # Edge Functions
docs/
  architecture/
  adr/
tests/
  unit/
  e2e/
```

A separação entre `features/` (regras de domínio, desacopladas de UI) e
`components/` (apresentação) segue a regra 17 do `CLAUDE.md`: regras de
negócio não devem ficar espalhadas em componentes React. A camada
`server/` concentra services, repositories, Server Actions e queries que
falam com o Supabase — nenhuma lógica de autorização crítica deve viver
apenas no cliente.

## Multi-tenancy e segurança (preparação para M1)

O scaffolding do M0 não implementa autenticação real, organizações nem RLS
— isso é responsabilidade do M1. Porém já preparamos:

- `src/lib/supabase/client.ts` — client Supabase para Client Components,
  usando apenas variáveis públicas.
- `src/lib/supabase/server.ts` — client Supabase para Server
  Components/Actions/Route Handlers, via cookies (`next/headers`),
  respeitando a sessão do usuário e portanto RLS.
- Route groups `(auth)` e `(app)` já isolados, com comentários `TODO M1`
  marcando onde a proteção por autenticação e o carregamento da organização
  ativa devem ser inseridos.

A `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser usada em código que roda no
navegador. Nenhum arquivo deste scaffolding a importa fora de
`.env.example` (documentação).

## Estados de UI

Todas as rotas do App Router herdam os arquivos especiais definidos na raiz
de `src/app`: `loading.tsx`, `error.tsx` e `not-found.tsx`, cobrindo os
estados obrigatórios de loading/error/not-found descritos na seção 12 do
`CLAUDE.md`. Os estados `empty`, `success` e `forbidden` serão tratados por
tela conforme cada feature for implementada (M2+).

## Próximos passos (M1)

- Supabase Auth (login, sessão, middleware de proteção de rotas).
- Modelagem de `organizations`, `memberships`, `roles`/`permissions`,
  `groups`.
- Migrations versionadas + RLS policies para as tabelas acima, com testes
  de acesso autorizado/negado e cross-tenant.

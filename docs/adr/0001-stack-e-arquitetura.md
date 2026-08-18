# ADR 0001 — Stack e arquitetura de pastas do BTS Pipe

- **Status**: Aceita
- **Data**: 2026-08-17
- **Milestone**: M0 — Fundação

## Contexto

O projeto precisa de uma fundação técnica capaz de suportar, ao longo dos
milestones M1–M8, um produto multi-tenant de gestão de processos e
workflows (pipes, kanban, automações, databases, portais externos,
relatórios/dashboards, integrações e IA), conforme `CLAUDE.md` seção 1. A
stack e a arquitetura de pastas precisam ser fixadas desde o início para
evitar retrabalho estrutural nos milestones seguintes.

## Decisão

Adotamos a stack obrigatória definida em `CLAUDE.md` seção 2:

- **Frontend**: Next.js (App Router), React, TypeScript em modo strict,
  Tailwind CSS, componentes próprios no padrão shadcn/ui (sem copiar UI
  proprietária de terceiros), React Hook Form + Zod para formulários,
  dnd-kit para drag-and-drop (Kanban, a partir de M2).
- **Backend/dados**: Supabase (PostgreSQL, Auth, Storage, Row Level
  Security) como base multi-tenant.
- **Deploy**: Vercel para a aplicação; Supabase para banco, autenticação e
  storage.
- **Testes**: Vitest para testes unitários/integração; Playwright para E2E.
- **Qualidade**: ESLint + Prettier + TypeScript strict + CI (GitHub
  Actions) rodando lint/typecheck/test/build em push e pull request.

E a estrutura de diretórios definida em `CLAUDE.md` seção 5:
`src/app` (rotas e route groups `(auth)`/`(app)`), `src/components` (UI
reutilizável), `src/features` (domínio por feature), `src/lib`
(infraestrutura transversal), `src/server` (services/repositories/
actions/queries — camada server-only), `src/types`, `tests/` (unit + e2e),
`supabase/` (migrations, seed, functions) e `docs/` (architecture, adr).

## Alternativas consideradas

- **Prisma + banco genérico** em vez de Supabase: rejeitado — Supabase já
  entrega Auth, Storage e RLS nativos, essenciais para o modelo
  multi-tenant exigido desde o M1, com menor esforço de integração.
- **Pages Router**: rejeitado em favor do App Router, que é o modelo atual
  recomendado pelo Next.js e mais adequado a Server Components/Actions,
  reduzindo exposição de lógica sensível no cliente.
- **Biblioteca de componentes de terceiros pronta** (ex.: Ant Design,
  Chakra): rejeitado — a stack exige shadcn/ui como base para manter
  identidade visual própria e controle total sobre o código dos
  componentes (regra 30 do `CLAUDE.md`: não copiar UI do Pipefy).
- **Jest** em vez de Vitest: ambos eram permitidos pelo `CLAUDE.md`;
  optamos por Vitest pela integração nativa com Vite/ESM e menor overhead
  de configuração no ecossistema Next.js atual.

## Consequências

- Toda nova tabela de negócio precisa de migration versionada em
  `supabase/migrations` + RLS (a partir do M1) — nenhuma exceção.
- Regras de negócio devem residir em `src/features` e `src/server`, nunca
  espalhadas em componentes React (`src/components`).
- `SUPABASE_SERVICE_ROLE_KEY` só pode ser referenciada em código
  server-side; os clients padrão (`src/lib/supabase/client.ts` e
  `server.ts`) usam somente as variáveis públicas.
- Mudanças estruturais na árvore de pastas ou na stack em milestones
  futuros exigem um novo ADR.

## Referências

- `CLAUDE.md` (fonte de verdade do projeto).
- `docs/architecture/overview.md`.

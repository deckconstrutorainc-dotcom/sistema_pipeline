# Koryn Task — Plano de Redesenho da Interface

## Contexto

O repositório continha o "BTS Pipe": motor de workflow (modelo Pipefy) com backend
sólido — 313 testes passando, 67 migrations, 156 policies RLS, build limpo — mas com
a camada de apresentação inacabada.

Decisão: **manter o motor, refazer a interface** no estilo Pipefy/Monday.

### Diagnóstico

Duas camadas de qualidade muito diferentes:

| Camada | Estado | Evidência |
|---|---|---|
| Motor (banco, RLS, automações, relatórios) | Sólido | 313 testes, 67 migrations, 156 policies |
| Interface | Inacabada | 7 componentes UI, kanban de 390 linhas, home dizendo "marco M0" |

**O achado mais grave não é visual:** várias server actions testadas não têm nenhuma
UI que as chame. O usuário não consegue editar um card depois de criado.

```
updateCardFields → 0 usos na UI    assignUser/unassignUser → 0 usos
addLabel/removeLabel → 0 usos      archiveCard → 0 usos
createPhase/updatePhase → 0 usos   createField/setPhaseField → 0 usos
```

A tela do card é um `<dl>` somente-leitura. Um pipe sem fases não oferece como criá-las.

## Definições aprovadas

1. **Radix UI parcial** — apenas Select, Dropdown Menu, Tooltip, Popover, Checkbox,
   Avatar. **Não** migrar Dialog e Tabs.
2. **Backend tocado apenas em dois pontos:** contagem de comentários/checklist no
   resumo dos cards, e preparação da paginação por fase. Nenhuma refatoração ampla.
3. **SLA** usa `updatedAt` como aproximação da entrada na fase — **provisório**,
   marcado no código até existir `phaseEnteredAt` real.
4. **Execução em etapas**, sem alterar todas as telas de uma vez.
5. **Sem dark mode agora.** Consolidar o tema claro primeiro.
6. **Preservar os 8 hex de fases** já gravados no banco; expandir de forma retrocompatível.
7. **Não alterar regras de negócio** durante a implementação visual.

## Fases

### Fase 1 — Design system, identidade e renomeação
- Tokens de cor (azul-índigo primário + âmbar de destaque), `--radius` 0.5 → 0.375
- Densidade: alturas 40px → 32px nos 7 componentes existentes
- `src/lib/phase-colors.ts` — mapa hex → classes (bar/soft/text), 8 originais + 4 novas
- Renomear "BTS Pipe" → "Koryn Task"
- Corrigir contraste das labels (hoje texto branco sobre hex claro é ilegível)

### Fase 2 — Redesenho do Kanban
- Componentes Radix: avatar, dropdown-menu, tooltip, select, checkbox, popover
- `column.tsx`: faixa colorida, contador, menu de fase
- `card-tile.tsx`: borda colorida, chips legíveis, avatares coloridos, badge de SLA
- Barra de filtros e busca (estado na URL)
- Menu de contexto no card — liga as actions órfãs
- Backend: contagem de comentários/checklist + preparo de paginação

### Fase 3 — Sidebar e navegação
- Sidebar fixa com ícones, agrupada por frequência de uso, tudo em pt-BR
- Resolver "Dashboard" vs "Dashboards" e a duplicação Reports/Dashboards
- Favoritos de pipe

### Fase 4 — Formulários, selects, tabelas, textareas, checkboxes
- Migrar HTML cru: 19 `<select>`, 13 `<textarea>`, 8 `checkbox`, 6 `<table>`

### Fase 5 — Loading, empty states, erros, quick view, performance
- Skeletons por rota, empty states com ação, toasts
- Drawer lateral do card
- Paginação incremental no board

## Regras herdadas do CLAUDE.md

- Migrations são imutáveis — sempre arquivo novo
- Toda tabela nasce com RLS
- Nenhum mock permanente em produção
- Erros nunca são escondidos

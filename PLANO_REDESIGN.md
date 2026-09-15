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

### Fase 2.5 — Edição de cards (inserida)
Antecipada por ser mais grave que o visual: o card era imutável depois de
criado. Concluída.
- Campos, título e prazo editáveis no lugar
- Responsáveis e etiquetas com adicionar/remover
- Menu de ações no cartão do quadro
- `field-input.tsx` compartilhado entre criação e edição

### Fase 3 — Sidebar e navegação — concluída
- Sidebar fixa com ícones, agrupada por frequência de uso, tudo em pt-BR
- "Dashboard" vs "Dashboards" resolvido pela renomeação para "Início" e
  "Indicadores"
- **URLs permanecem em inglês** (decidido em 14/09/2026): rótulos em pt-BR,
  rotas em inglês. Não traduzir `/dashboard`, `/pipes`, `/tasks`.
- Pendente: favoritos de pipe na sidebar

### Fase 4 — Formulários, selects, tabelas — concluída
- 12 `<textarea>` → `<Textarea>`; 5 checkboxes controlados → `<Checkbox>`;
  19 `<select>` uniformizados; 6 `<table>` → componentes `Table`
- Componentes novos: `ui/select.tsx`, `ui/table.tsx`, `ui/textarea.tsx`
- Os `<select>` seguem nativos por usarem `{...register}` do react-hook-form;
  o Radix Select exigiria `<Controller>` em cada um

### Fase 5 — Loading, empty states, erros — concluída
- 10 `loading.tsx` (eram 3), com silhueta própria por tipo de tela
- `(app)/error.tsx` captura falhas sem derrubar a navegação
- Toasts substituem o aviso inline do quadro, que sumia no scroll
- Estados vazios explicam o que fazer, não só que está vazio

## Pendências conhecidas

- **SLA impreciso**: usa `cards.updated_at` como aproximação da entrada na
  fase, então editar um card reinicia o prazo. Exige coluna
  `phase_entered_at` real e calendário de horário útil.
- **Anexos**: só metadados; falta integrar o Supabase Storage.
- **E-mail e notificações**: registram no console, sem provedor real.
- **Worker**: a fila de jobs depende de cron; no plano Hobby da Vercel é
  1×/dia. Alternativa: `pg_cron` do Supabase.
- **Testes E2E**: existem como esqueleto, quase todos `test.skip`.
- **Não feito nesta rodada**: drawer lateral do card, paginação incremental
  no quadro (hoje carrega todos os cards do pipe de uma vez), busca e
  filtros no quadro, favoritos de pipe.

## Regras herdadas do CLAUDE.md

- Migrations são imutáveis — sempre arquivo novo
- Toda tabela nasce com RLS
- Nenhum mock permanente em produção
- Erros nunca são escondidos

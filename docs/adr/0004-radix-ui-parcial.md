# ADR 0004 — Adoção parcial do Radix UI

- **Status**: Aceita
- **Data**: 2026-09-11
- **Contexto**: redesenho da interface do Koryn Task

## Contexto

O projeto nasceu com componentes shadcn-like escritos à mão (`cva` + `clsx` +
`tailwind-merge`), sem nenhuma dependência `@radix-ui/*`. Essa decisão está
registrada na ADR-0001 e reforçada por comentários em `src/components/ui/dialog.tsx`
e `tabs.tsx`. O `CLAUDE.md` §21 também restringe dependências novas
("não crie dependências grandes sem necessidade técnica comprovada").

O redesenho expôs os limites dessa abordagem em um ponto específico:
**posicionamento de elementos flutuantes**.

`src/components/forms/phase-color-picker.tsx` posiciona seu painel com
`absolute left-0 top-full`, dentro de uma coluna do kanban que tem
`overflow-x-auto` no ancestral. O resultado é previsível: perto da borda
direita da tela, ou com o quadro rolado, o painel é cortado ou aparece fora
do lugar.

Resolver isso corretamente significa implementar detecção de colisão com o
viewport, *flip*, *shift* e ancoragem em portal — ou seja, reimplementar o
Floating UI. O mesmo problema atinge todo componente flutuante do redesenho:
menu de ações do card, seletor de responsável, filtros, tooltips.

O segundo motivo é acessibilidade de teclado: *roving tabindex*, *typeahead*
e `aria-activedescendant` em listbox/menu somam centenas de linhas por
componente e concentram bugs sutis. O próprio `dialog.tsx` admite em
comentário que **não** implementa um focus trap completo.

## Decisão

Adotar Radix UI **parcialmente**, somente onde há necessidade técnica
comprovada:

| Pacote | Motivo |
|---|---|
| `react-popover` | posicionamento flutuante com colisão |
| `react-dropdown-menu` | idem + navegação por teclado em menu |
| `react-select` | idem + typeahead; substitui `<select>` cru em 19 arquivos |
| `react-tooltip` | idem + acessibilidade |
| `react-checkbox` | checkbox nativo não estiliza de forma consistente |
| `react-avatar` | fallback de iniciais com carregamento previsível |

**Não adotar** para:

- `dialog` — o atual funciona e é usado em ~20 formulários; migrar é risco
  alto sem ganho visual. A dívida do focus trap fica registrada.
- `tabs` — trivial e já funciona.
- `label`, `separator`, `progress`, `toast` — escrever à mão é mais barato
  que a dependência.

## Consequências

**Positivas**
- Elimina uma classe inteira de bugs de posicionamento, incluindo um já
  presente no seletor de cores.
- Acessibilidade de teclado correta sem custo de implementação.
- Cada pacote é independente e pequeno; instala-se só o que se usa.

**Negativas**
- Seis dependências novas, contrariando a postura original do projeto.
- Dois padrões de componente convivem: Radix (novos) e à mão (dialog, tabs).
  Aceito conscientemente — migrar tudo teria custo alto e ganho baixo.

## Alternativa considerada

Usar apenas `@floating-ui/react-dom` (uma dependência, ~15 KB) e escrever a
acessibilidade à mão. Resolveria o posicionamento, mas custaria cerca de três
dias a mais e entregaria menos garantias de teclado e ARIA.

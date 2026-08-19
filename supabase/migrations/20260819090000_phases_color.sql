-- M2 — Workflow Core (enriquecimento visual do Kanban)
-- `phases.color`: cor de destaque (hex) usada como barra/indicador no topo
-- da coluna do Kanban e no seletor de cor da fase. É puramente decorativo
-- (não afeta regra de negócio, RLS ou automações) — recurso funcional
-- universal de ferramentas de workflow em Kanban, não é cópia de UI de
-- nenhum produto específico (CLAUDE.md §3.30).
--
-- Nullable: fases sem cor definida caem no visual neutro padrão da coluna.
-- Restrito a hex de 6 dígitos para evitar valores arbitrários (CSS
-- injection não é um risco real aqui já que é renderizado via style prop
-- de um componente React controlado, mas mantemos o formato estrito por
-- integridade de dados).

alter table public.phases
  add column if not exists color text;

alter table public.phases
  drop constraint if exists phases_color_hex_format;

alter table public.phases
  add constraint phases_color_hex_format
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.phases.color is
  'Cor de destaque (hex #RRGGBB) exibida na borda/indicador superior da coluna do Kanban. Nullable — sem cor definida usa o visual neutro padrão.';

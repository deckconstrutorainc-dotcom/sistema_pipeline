/**
 * Tradução de cor persistida (hex) para classes Tailwind.
 *
 * `phases.color` e `labels.color` guardam hex literal no banco. Renderizar
 * esse hex direto em `style={{ backgroundColor }}` com `text-white` por cima
 * quebra a legibilidade: uma label âmbar (#F59E0B) com texto branco fica em
 * ~1.9:1 de contraste, muito abaixo do mínimo AA de 4.5:1.
 *
 * Aqui cada hex conhecido mapeia para uma tripla de classes já pensada para
 * contraste:
 *   - `bar`  superfície sólida (faixa no topo da coluna, bolinha)
 *   - `soft` fundo suave para chips e badges
 *   - `text` cor de texto legível SOBRE `soft`
 *
 * IMPORTANTE: as classes são strings literais de propósito. O JIT do Tailwind
 * varre o código-fonte em busca de nomes de classe completos — algo como
 * `bg-${cor}-500` nunca seria gerado. Por isso `tailwind.config.ts` inclui
 * `./src/lib/**` no `content`.
 *
 * Para cores fora da paleta (dados legados, label criada com hex arbitrário),
 * `getLabelStyle` calcula o contraste em tempo de execução.
 */

export interface PhaseColorTokens {
  /** Nome em pt-BR, exibido no seletor de cores. */
  name: string;
  /** Fundo sólido: faixa do topo da coluna, indicador circular. */
  bar: string;
  /** Fundo suave: chips, badges, contadores. */
  soft: string;
  /** Texto legível sobre `soft`. */
  text: string;
  /** Anel/borda de destaque no hover. */
  ring: string;
}

/**
 * Chave = hex gravado em `phases.color`, em maiúsculas.
 * Mantém 1:1 com `phaseColorPalette` em `src/lib/validation/phases.ts`.
 */
export const PHASE_COLORS: Record<string, PhaseColorTokens> = {
  "#3B82F6": {
    name: "Azul",
    bar: "bg-blue-500",
    soft: "bg-blue-100 dark:bg-blue-500/15",
    text: "text-blue-800 dark:text-blue-300",
    ring: "ring-blue-400",
  },
  "#06B6D4": {
    name: "Ciano",
    bar: "bg-cyan-500",
    soft: "bg-cyan-100 dark:bg-cyan-500/15",
    text: "text-cyan-900 dark:text-cyan-300",
    ring: "ring-cyan-400",
  },
  "#0D9488": {
    name: "Teal",
    bar: "bg-teal-600",
    soft: "bg-teal-100 dark:bg-teal-500/15",
    text: "text-teal-900 dark:text-teal-300",
    ring: "ring-teal-400",
  },
  "#10B981": {
    name: "Esmeralda",
    bar: "bg-emerald-500",
    soft: "bg-emerald-100 dark:bg-emerald-500/15",
    text: "text-emerald-900 dark:text-emerald-300",
    ring: "ring-emerald-400",
  },
  "#84CC16": {
    name: "Lima",
    bar: "bg-lime-500",
    soft: "bg-lime-100 dark:bg-lime-500/15",
    text: "text-lime-900 dark:text-lime-300",
    ring: "ring-lime-400",
  },
  "#F59E0B": {
    name: "Âmbar",
    bar: "bg-amber-500",
    soft: "bg-amber-100 dark:bg-amber-500/15",
    text: "text-amber-900 dark:text-amber-300",
    ring: "ring-amber-400",
  },
  "#F97316": {
    name: "Laranja",
    bar: "bg-orange-500",
    soft: "bg-orange-100 dark:bg-orange-500/15",
    text: "text-orange-900 dark:text-orange-300",
    ring: "ring-orange-400",
  },
  "#EF4444": {
    name: "Vermelho",
    bar: "bg-red-500",
    soft: "bg-red-100 dark:bg-red-500/15",
    text: "text-red-800 dark:text-red-300",
    ring: "ring-red-400",
  },
  "#EC4899": {
    name: "Rosa",
    bar: "bg-pink-500",
    soft: "bg-pink-100 dark:bg-pink-500/15",
    text: "text-pink-800 dark:text-pink-300",
    ring: "ring-pink-400",
  },
  "#A855F7": {
    name: "Púrpura",
    bar: "bg-purple-500",
    soft: "bg-purple-100 dark:bg-purple-500/15",
    text: "text-purple-800 dark:text-purple-300",
    ring: "ring-purple-400",
  },
  "#8B5CF6": {
    name: "Violeta",
    bar: "bg-violet-500",
    soft: "bg-violet-100 dark:bg-violet-500/15",
    text: "text-violet-800 dark:text-violet-300",
    ring: "ring-violet-400",
  },
  "#64748B": {
    name: "Cinza",
    bar: "bg-slate-500",
    soft: "bg-slate-200 dark:bg-slate-500/20",
    text: "text-slate-800 dark:text-slate-300",
    ring: "ring-slate-400",
  },
};

/** Fase sem cor definida (`phases.color IS NULL`). */
export const DEFAULT_PHASE_COLOR: PhaseColorTokens = {
  name: "Padrão",
  bar: "bg-slate-400",
  soft: "bg-slate-100 dark:bg-slate-500/15",
  text: "text-slate-700 dark:text-slate-300",
  ring: "ring-slate-300",
};

/**
 * Resolve o hex da fase. Aceita `null` e hex fora da paleta (dados legados),
 * caindo no padrão em vez de quebrar a renderização.
 */
export function getPhaseColor(hex: string | null | undefined): PhaseColorTokens {
  if (!hex) return DEFAULT_PHASE_COLOR;
  return PHASE_COLORS[hex.toUpperCase()] ?? DEFAULT_PHASE_COLOR;
}

/**
 * Luminância relativa segundo a WCAG 2.x.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export interface LabelStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

/**
 * Estilo inline de uma label a partir de um hex arbitrário.
 *
 * Labels são criadas pelo usuário com cor livre, então não há tabela fixa para
 * consultar. A estratégia é um chip suave — fundo com baixa opacidade da
 * própria cor e texto na cor cheia — que preserva a identidade da label e
 * mantém contraste mesmo em cores muito claras (amarelo, lima), onde o
 * `text-white` anterior falhava.
 *
 * Em cores claras demais, o texto deixa de usar a própria cor e passa a
 * seguir `currentcolor` — que é quase-preto no tema claro e quase-branco no
 * escuro. Foi o jeito de atender aos dois temas numa cor que é calculada em
 * tempo de execução e portanto não aceita variante `dark:` do Tailwind.
 */
export function getLabelStyle(hex: string | null | undefined): LabelStyle {
  const rgb = hex ? parseHex(hex) : null;

  if (!rgb) {
    return {
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--muted-foreground))",
      borderColor: "hsl(var(--border))",
    };
  }

  const { r, g, b } = rgb;
  const luminance = relativeLuminance(r, g, b);

  // Cores claras (amarelo, lima, ciano-claro) não têm contraste suficiente
  // como texto sobre fundo claro — usa um neutro escuro no lugar.
  const isLight = luminance > 0.45;

  // `color-mix` com `currentcolor` resolve os dois temas de uma vez: no
  // claro o texto se aproxima do preto, no escuro do branco, porque
  // `currentcolor` herda a cor de texto vigente. Cor calculada em tempo de
  // execução não tem como usar variante `dark:` do Tailwind.
  const readable = isLight
    ? "color-mix(in srgb, currentcolor 78%, transparent)"
    : `color-mix(in srgb, rgb(${r}, ${g}, ${b}) 72%, currentcolor)`;

  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
    color: readable,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}

/**
 * Cor determinística de avatar a partir de um id estável (userId).
 *
 * Sem foto real, todos os avatares ficavam cinza e o quadro parecia morto.
 * Derivar a cor do id dá identidade visual consistente: a mesma pessoa tem
 * sempre a mesma cor, em qualquer tela e sessão.
 */
const AVATAR_COLORS: readonly { bg: string; text: string }[] = [
  { bg: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-800 dark:text-blue-200" },
  { bg: "bg-emerald-100 dark:bg-emerald-500/20", text: "text-emerald-800 dark:text-emerald-200" },
  { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-900 dark:text-amber-200" },
  { bg: "bg-rose-100 dark:bg-rose-500/20", text: "text-rose-800 dark:text-rose-200" },
  { bg: "bg-violet-100 dark:bg-violet-500/20", text: "text-violet-800 dark:text-violet-200" },
  { bg: "bg-cyan-100 dark:bg-cyan-500/20", text: "text-cyan-900 dark:text-cyan-200" },
  { bg: "bg-orange-100 dark:bg-orange-500/20", text: "text-orange-900 dark:text-orange-200" },
  { bg: "bg-teal-100 dark:bg-teal-500/20", text: "text-teal-900 dark:text-teal-200" },
];

export function getAvatarColor(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    // eslint-disable-next-line no-bitwise -- hash simples e estável, não criptográfico
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    // eslint-disable-next-line no-bitwise -- mantém o valor em 32 bits
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? AVATAR_COLORS[0]!;
}

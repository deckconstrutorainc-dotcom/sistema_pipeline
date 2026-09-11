import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
    // `src/lib/phase-colors.ts` guarda classes de cor como strings literais
    // (bg-blue-500, text-blue-800, ...). Sem varrer `src/lib`, o JIT não gera
    // nenhuma delas e as fases do quadro ficam sem cor.
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        brand: {
          50: "hsl(var(--brand-50))",
          100: "hsl(var(--brand-100))",
          200: "hsl(var(--brand-200))",
          300: "hsl(var(--brand-300))",
          400: "hsl(var(--brand-400))",
          500: "hsl(var(--brand-500))",
          600: "hsl(var(--brand-600))",
          700: "hsl(var(--brand-700))",
          800: "hsl(var(--brand-800))",
          900: "hsl(var(--brand-900))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        board: "hsl(var(--board-bg))",
        column: {
          DEFAULT: "hsl(var(--column-bg))",
          header: "hsl(var(--column-header))",
        },
        tile: {
          DEFAULT: "hsl(var(--tile-bg))",
          border: "hsl(var(--tile-border))",
        },
      },
      // Escala densa, prefixada com `ui-` para conviver com os `text-sm`
      // existentes sem quebrá-los. Ferramenta de trabalho pede mais
      // informação por tela do que o padrão espaçado do shadcn.
      fontSize: {
        "ui-2xs": ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.01em" }],
        "ui-xs": ["0.6875rem", { lineHeight: "1rem" }],
        "ui-sm": ["0.75rem", { lineHeight: "1.125rem" }],
        "ui-base": ["0.8125rem", { lineHeight: "1.25rem" }],
        "ui-md": ["0.875rem", { lineHeight: "1.25rem" }],
        "ui-lg": ["1rem", { lineHeight: "1.375rem" }],
        "ui-xl": ["1.25rem", { lineHeight: "1.625rem" }],
        "ui-2xl": ["1.5rem", { lineHeight: "1.875rem" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "zoom-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "zoom-in": "zoom-in 120ms ease-out",
        "slide-in-right": "slide-in-right 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

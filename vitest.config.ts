import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
    ],
    globals: true,
    // Concorrência conservadora entre ARQUIVOS de teste (não afeta os `it()`
    // dentro de um mesmo arquivo, que já rodam sequencialmente).
    //
    // Motivo: `tests/integration/*.test.ts` cria, por arquivo, uma instância
    // nova de Postgres real via `@electric-sql/pglite` (WASM) em `beforeAll`
    // — ver `tests/integration/setup/pglite-supabase.ts`. O default do
    // Vitest (pool "threads", até `os.cpus().length` workers) tenta rodar
    // TODOS os ~9 arquivos que usam o harness em paralelo, ou seja, até 9
    // Postgres/WASM completos carregados em memória ao mesmo tempo — em
    // máquinas/CI com menos memória disponível isso derruba um worker por
    // OOM de forma intermitente (achado ao rodar a suíte real repetidas
    // vezes). Limitar a no máximo 2 arquivos concorrentes elimina o pico de
    // memória de forma determinística sem tornar a suíte sequencial (o que
    // seria desnecessariamente lento) — testado repetidamente sem crash.
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});

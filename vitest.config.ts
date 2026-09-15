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
    // todos os arquivos do harness em paralelo, ou seja, vários
    // Postgres/WASM completos em memória ao mesmo tempo, e derruba workers
    // com "Fatal process out of memory".
    //
    // `maxThreads: 2` bastava com 9 arquivos de integração. Ao chegar ao
    // décimo (notifications), voltaram os OOMs — e a máquina tem 17 GB
    // livres, então o limite não é a RAM: é o heap POR WORKER do V8, que
    // cada instância de PGlite consome quase inteiro.
    //
    // `fileParallelism: false` serializa os arquivos de verdade (os `it()`
    // dentro de cada um já eram sequenciais), de modo que só existe um
    // Postgres/WASM vivo por vez. `maxThreads: 1` reforça isso para o caso
    // de a flag ser sobrescrita na linha de comando.
    fileParallelism: false,
    poolOptions: {
      threads: {
        maxThreads: 1,
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

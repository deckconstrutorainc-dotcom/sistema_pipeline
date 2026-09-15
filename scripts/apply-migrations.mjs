/**
 * Aplica as migrations do Koryn Task num Postgres remoto, em ordem de nome.
 *
 * Cada arquivo roda dentro de uma transação: se falhar, nada daquele arquivo
 * é gravado e o processo para, para não deixar o schema pela metade.
 *
 * Uso: node apply-migrations.mjs <connection-string> <dir-migrations> [seed.sql]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const [connectionString, migrationsDir, seedPath] = process.argv.slice(2);

if (!connectionString || !migrationsDir) {
  console.error("uso: node apply-migrations.mjs <conn> <dir> [seed]");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Migrations com muitas policies podem demorar; o padrão de 30s é curto.
  statement_timeout: 120_000,
});

await client.connect();

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

console.log(`${files.length} migrations a aplicar\n`);

let applied = 0;

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  process.stdout.write(`  ${file} ... `);

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    applied += 1;
    console.log("ok");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.log("FALHOU");
    console.error(`\n--- erro em ${file} ---`);
    console.error(error.message);
    if (error.hint) console.error(`dica: ${error.hint}`);
    if (error.position) console.error(`posição: ${error.position}`);
    await client.end();
    process.exit(1);
  }
}

console.log(`\n${applied} migrations aplicadas.`);

if (seedPath) {
  process.stdout.write("aplicando seed ... ");
  try {
    await client.query("begin");
    await client.query(readFileSync(seedPath, "utf8"));
    await client.query("commit");
    console.log("ok");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.log("FALHOU");
    console.error(error.message);
    await client.end();
    process.exit(1);
  }
}

const { rows } = await client.query(
  `select count(*)::int as tabelas from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'`,
);
const { rows: policies } = await client.query(
  "select count(*)::int as policies from pg_policies where schemaname = 'public'",
);

console.log(`\nResultado: ${rows[0].tabelas} tabelas, ${policies[0].policies} policies RLS.`);

await client.end();

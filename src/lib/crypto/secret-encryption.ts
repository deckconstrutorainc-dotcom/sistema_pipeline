/**
 * Criptografia de segredos de integração (CLAUDE.md §3.10 — mesma
 * disciplina de "nunca exponha credenciais administrativas" aplicada a
 * QUALQUER segredo de terceiro: token/API key/client secret de
 * integrações e o secret de assinatura HMAC de webhooks).
 *
 * DECISÃO DE DESIGN (documentada — ver também comentário em
 * `supabase/migrations/20260818094500_integration_credentials.sql`):
 * criptografia em CAMADA DE APLICAÇÃO (Node `crypto`, AES-256-GCM), não no
 * banco via `pgcrypto`. A alternativa de banco (`pgp_sym_encrypt`/
 * `pgp_sym_decrypt` com `current_setting('app.encryption_key')`) é
 * igualmente válida e mencionada como opção — não foi escolhida aqui
 * porque, em um projeto Supabase hospedado, configurar essa chave de
 * sessão de Postgres exige um passo de infraestrutura fora de qualquer
 * migration versionada (senão a chave apareceria em texto no SQL
 * commitado, o que violaria a própria regra que se está tentando
 * cumprir). Fazendo a cripto em TypeScript:
 *   - a chave nunca aparece em SQL versionado;
 *   - a coluna no banco é só `text` opaco, e RLS + GRANT de coluna (ver
 *     migrations de M7) já impedem leitura via client de qualquer forma —
 *     esta camada é sobre proteger o segredo mesmo de um vazamento via
 *     `service_role` acidental (ex.: log, dump de banco), não apenas do
 *     client comum;
 *   - este módulo é puro o bastante para ser testado sem banco.
 *
 * TRADE-OFF aceito: a chave (`ENCRYPTION_KEY`) precisa ser gerenciada como
 * segredo de aplicação (env var no Vercel, nunca commitada — ver
 * `.env.example`), e sua rotação exige re-criptografar todas as linhas
 * existentes (não implementado — ver PENDÊNCIA no relatório final). Um KMS
 * gerenciado (ex.: Supabase Vault, AWS KMS) resolveria rotação de chave de
 * forma mais robusta; fora do escopo deste milestone por exigir
 * infraestrutura externa não disponível neste ambiente.
 *
 * Uso EXCLUSIVAMENTE server-side (server actions, route handlers, services
 * server-only) — nunca importar este módulo de um componente "use client".
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

function resolveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY não configurada no servidor. Necessária para criptografar/decriptar segredos de integração (ver .env.example).",
    );
  }

  // Aceita a chave em base64 ou hex, desde que resulte em 32 bytes
  // (AES-256). Gerar com: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  const candidates = [
    () => Buffer.from(raw, "base64"),
    () => Buffer.from(raw, "hex"),
  ];

  for (const candidate of candidates) {
    let buf: Buffer;
    try {
      buf = candidate();
    } catch {
      continue;
    }
    if (buf.length === KEY_LENGTH_BYTES) {
      return buf;
    }
  }

  throw new Error(
    `ENCRYPTION_KEY inválida: deve decodificar (base64 ou hex) para exatamente ${KEY_LENGTH_BYTES} bytes.`,
  );
}

/**
 * Criptografa um segredo em texto plano. Retorna uma string opaca
 * (base64 de `iv || authTag || ciphertext`) pronta para persistir em
 * `secret_ciphertext`. Nunca lança o valor original em erro/log.
 */
export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decripta um `secret_ciphertext` gravado por `encryptSecret`. Lança erro
 * genérico em caso de falha (chave errada, dado corrompido) — NUNCA inclui
 * o ciphertext nem qualquer fragmento do segredo na mensagem de erro
 * (poderia vazar em logs).
 */
export function decryptSecret(ciphertextBase64: string): string {
  const key = resolveKey();
  const buf = Buffer.from(ciphertextBase64, "base64");

  const iv = buf.subarray(0, IV_LENGTH_BYTES);
  const authTag = buf.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + 16);
  const ciphertext = buf.subarray(IV_LENGTH_BYTES + 16);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("Não foi possível decriptar o segredo (chave incorreta ou dado corrompido).");
  }
}

/**
 * Últimos 4 caracteres de um segredo, para exibição cosmética na UI
 * ("****1234"). Nunca usado para reconstruir o segredo. Retorna `null`
 * para segredos com menos de 4 caracteres (evita expor o segredo inteiro).
 */
export function lastFourChars(secret: string): string | null {
  if (secret.length < 4) {
    return null;
  }
  return secret.slice(-4);
}

/**
 * Compara duas strings em tempo constante (proteção contra timing attack)
 * — usada para validar assinaturas HMAC recebidas. Retorna `false` (nunca
 * lança) quando os tamanhos diferem, já que `timingSafeEqual` exige
 * buffers do mesmo tamanho.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

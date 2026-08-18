import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client administrativo com `SUPABASE_SERVICE_ROLE_KEY`, que faz bypass de
 * RLS. Uso restrito a operações server-side que comprovadamente exigem
 * privilégio elevado e não têm caminho seguro via RLS — ex.: resolver o
 * `auth.users.id` de um e-mail ao convidar um membro (a tabela `auth.users`
 * não é exposta ao PostgREST/RLS do client autenticado comum).
 *
 * NUNCA importe este módulo em código que rode no navegador ("use client")
 * nem reexporte o client resultante para o client. Este arquivo depende de
 * `SUPABASE_SERVICE_ROLE_KEY`, que não tem prefixo `NEXT_PUBLIC_*` e
 * portanto não é incluída no bundle do navegador — mas a disciplina de uso
 * (só chamar a partir de server actions/route handlers) continua sendo
 * responsabilidade de quem importa este módulo.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

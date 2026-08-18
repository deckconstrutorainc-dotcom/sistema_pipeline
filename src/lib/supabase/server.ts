import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Cliente Supabase para uso em Server Components, Server Actions e Route
 * Handlers. Usa somente variáveis públicas (NEXT_PUBLIC_*) + sessão via
 * cookies — respeita RLS como o usuário autenticado.
 *
 * Nunca use este client para operações que exigem bypass de RLS. Para isso,
 * crie um client administrativo dedicado, restrito a código server-side,
 * usando SUPABASE_SERVICE_ROLE_KEY (fora deste arquivo, com justificativa
 * técnica explícita).
 */
export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll pode ser chamado a partir de um Server Component, onde a
          // escrita de cookies não é permitida. Isso é seguro de ignorar
          // quando há um middleware responsável por atualizar a sessão.
        }
      },
    },
  });
}

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase verdadeiramente anônimo — sem sessão, sem cookies. Uso
 * exclusivo da ÚNICA superfície pública/não autenticada do sistema: a rota
 * de submissão/consulta de portal (`src/app/api/portals/[slug]/submit/route.ts`,
 * páginas em `src/app/portal/**`). Usa somente `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * — nunca a service role — e por isso continua sujeito a RLS/aos grants
 * explícitos `to anon` das três funções SECURITY DEFINER de M5
 * (`get_portal_public_config`, `submit_portal_request`,
 * `get_request_status_by_protocol`).
 *
 * Diferente de `src/lib/supabase/server.ts`, este client NÃO lê/escreve
 * cookies de sessão: o visitante externo nunca está autenticado, então não
 * há sessão para persistir.
 */
export function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

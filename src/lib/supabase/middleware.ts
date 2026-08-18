import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Atualiza a sessão Supabase (refresh de tokens) em toda request, seguindo
 * o padrão oficial `@supabase/ssr` para Next.js App Router. Deve ser
 * chamado a partir de `middleware.ts` na raiz do projeto.
 *
 * Não implementa regras de autorização de rota — isso é responsabilidade
 * de `requireAuth()`/`requireActiveOrganization()` em cada layout/página
 * server-side (defesa em profundidade: o middleware só garante que a
 * sessão chega atualizada, o servidor decide o que é permitido).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Sem Supabase configurado (ex.: ambiente local sem .env), não há
    // sessão para atualizar. Deixa a request seguir normalmente em vez de
    // derrubar toda a aplicação — as páginas protegidas ainda vão exigir
    // autenticação via requireAuth().
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANTE: getUser() revalida o token contra o servidor de Auth do
  // Supabase (ao contrário de getSession(), que apenas lê o cookie local).
  // Necessário para o refresh de sessão funcionar de forma confiável.
  await supabase.auth.getUser();

  return response;
}

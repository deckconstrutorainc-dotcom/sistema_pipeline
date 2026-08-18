-- M1 — Segurança e Tenant
-- Função auxiliar para resolver o `auth.users.id` de um e-mail ao convidar
-- um membro. `auth.users` não é exposta ao schema `public`/PostgREST, então
-- essa é a via segura e explícita para o servidor da aplicação (usando o
-- client administrativo com SUPABASE_SERVICE_ROLE_KEY) resolver esse dado
-- sem dar acesso de leitura amplo à tabela de autenticação.
--
-- Restrita a `service_role`: nunca é exposta a `anon`/`authenticated`.

create or replace function public.find_user_id_by_email(lookup_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(email) = lower(lookup_email)
  limit 1;
$$;

comment on function public.find_user_id_by_email(text) is
  'Resolve auth.users.id a partir de um e-mail. Uso restrito a service_role (fluxo de convite de membro).';

revoke all on function public.find_user_id_by_email(text) from public;
revoke all on function public.find_user_id_by_email(text) from authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

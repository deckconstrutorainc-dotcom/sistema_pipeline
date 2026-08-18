-- M1 — Segurança e Tenant
-- `profiles`: extensão pública de `auth.users` (id compartilhado 1:1).
-- Criada automaticamente via trigger em `auth.users` (on_auth_user_created).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil público de cada usuário autenticado (1:1 com auth.users).';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-criação de profile ao criar um novo auth.users.
-- SECURITY DEFINER: precisa escrever em public.profiles em nome do sistema,
-- fora do contexto de RLS do usuário recém-criado (que ainda não tem sessão).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria automaticamente public.profiles ao registrar um novo auth.users.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

alter table public.profiles enable row level security;

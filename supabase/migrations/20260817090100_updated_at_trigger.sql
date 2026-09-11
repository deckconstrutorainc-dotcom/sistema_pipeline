-- M1 — Segurança e Tenant
-- Função utilitária reaproveitada por todas as tabelas com coluna
-- `updated_at`. Mantém o timestamp em UTC (timestamptz).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Atualiza automaticamente a coluna updated_at antes de UPDATE.';

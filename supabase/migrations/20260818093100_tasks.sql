-- M5 — Colaboração Externa
-- `tasks`: tarefa interna, opcionalmente ligada a um card e/ou a um pipe.
--
-- Visibilidade (ver policies em `20260818093700_collaboration_rls_policies.sql`):
--   - `pipe_id` nulo  -> qualquer membro ativo da organização vê a tarefa.
--   - `pipe_id` setado -> só quem tem acesso ao pipe (`is_pipe_member`,
--     que já respeita `pipes.is_restricted`) vê a tarefa — mais restritivo,
--     coerente com o pipe poder ser restrito.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  card_id uuid references public.cards (id) on delete cascade,
  pipe_id uuid references public.pipes (id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users (id) on delete set null,
  due_date timestamptz,
  status text not null default 'open',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_not_blank check (btrim(title) <> ''),
  constraint tasks_status_check check (status in ('open', 'in_progress', 'done', 'cancelled'))
);

comment on table public.tasks is
  'Tarefa interna, opcionalmente ligada a um card e/ou pipe. status: open, in_progress, done, cancelled.';

create index if not exists tasks_organization_id_idx
  on public.tasks (organization_id);

create index if not exists tasks_card_id_idx
  on public.tasks (card_id);

create index if not exists tasks_pipe_id_idx
  on public.tasks (pipe_id);

create index if not exists tasks_assigned_to_idx
  on public.tasks (assigned_to);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();

alter table public.tasks enable row level security;

-- Defesa em profundidade: garante consistência de tenant entre
-- organization_id / card_id / pipe_id quando mais de um estiver setado —
-- mesmo padrão dos triggers "check_*_same_pipe" do M2/M4.
create or replace function public.check_task_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  v_card_pipe_id uuid;
  v_card_org_id uuid;
  v_pipe_org_id uuid;
begin
  if new.card_id is not null then
    select pipe_id into v_card_pipe_id from public.cards where id = new.card_id;
    if v_card_pipe_id is null then
      raise exception 'Card inexistente.';
    end if;

    select organization_id into v_card_org_id from public.pipes where id = v_card_pipe_id;
    if v_card_org_id <> new.organization_id then
      raise exception 'A tarefa deve pertencer à mesma organização do card.';
    end if;

    if new.pipe_id is not null and new.pipe_id <> v_card_pipe_id then
      raise exception 'O pipe da tarefa deve ser o mesmo pipe do card.';
    end if;
  elsif new.pipe_id is not null then
    select organization_id into v_pipe_org_id from public.pipes where id = new.pipe_id;
    if v_pipe_org_id is null then
      raise exception 'Pipe inexistente.';
    end if;
    if v_pipe_org_id <> new.organization_id then
      raise exception 'A tarefa deve pertencer à mesma organização do pipe.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists check_task_tenant_consistency_trigger on public.tasks;
create trigger check_task_tenant_consistency_trigger
  before insert or update on public.tasks
  for each row
  execute function public.check_task_tenant_consistency();

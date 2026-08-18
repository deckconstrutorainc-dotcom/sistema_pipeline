-- M2 — Workflow Core
-- `card_assignments`, `labels`, `card_labels`, `comments`: colaboração em
-- torno de um card.

create table if not exists public.card_assignments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint card_assignments_unique unique (card_id, user_id)
);

comment on table public.card_assignments is
  'Responsáveis atribuídos a um card.';

create index if not exists card_assignments_card_id_idx
  on public.card_assignments (card_id);

create index if not exists card_assignments_user_id_idx
  on public.card_assignments (user_id);

alter table public.card_assignments enable row level security;

-- ---------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  constraint labels_name_not_blank check (btrim(name) <> ''),
  constraint labels_pipe_name_unique unique (pipe_id, name)
);

comment on table public.labels is
  'Etiqueta reutilizável definida no nível do pipe.';

create index if not exists labels_pipe_id_idx
  on public.labels (pipe_id);

alter table public.labels enable row level security;

-- ---------------------------------------------------------------------
-- card_labels
-- ---------------------------------------------------------------------

create table if not exists public.card_labels (
  card_id uuid not null references public.cards (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, label_id)
);

comment on table public.card_labels is
  'Associação N:N entre cards e labels do mesmo pipe.';

create index if not exists card_labels_label_id_idx
  on public.card_labels (label_id);

alter table public.card_labels enable row level security;

create or replace function public.check_card_label_same_pipe()
returns trigger
language plpgsql
as $$
declare
  v_card_pipe_id uuid;
  v_label_pipe_id uuid;
begin
  select pipe_id into v_card_pipe_id from public.cards where id = new.card_id;
  select pipe_id into v_label_pipe_id from public.labels where id = new.label_id;

  if v_card_pipe_id is null or v_label_pipe_id is null then
    raise exception 'Card ou label inexistente.';
  end if;

  if v_card_pipe_id <> v_label_pipe_id then
    raise exception 'A label deve pertencer ao mesmo pipe do card.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_card_label_same_pipe_trigger on public.card_labels;
create trigger check_card_label_same_pipe_trigger
  before insert or update on public.card_labels
  for each row
  execute function public.check_card_label_same_pipe();

-- ---------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_not_blank check (btrim(body) <> '')
);

comment on table public.comments is
  'Comentário em um card.';

create index if not exists comments_card_id_idx
  on public.comments (card_id);

drop trigger if exists set_comments_updated_at on public.comments;
create trigger set_comments_updated_at
  before update on public.comments
  for each row
  execute function public.set_updated_at();

alter table public.comments enable row level security;

-- M2 — Workflow Core
-- `fields`: campos dinâmicos de um pipe. Modelados no nível do PIPE (não da
-- fase), com uma tabela de associação `phase_fields` controlando
-- obrigatoriedade/visibilidade por fase — decisão explícita: um campo é
-- definido uma única vez e reutilizado em todas as fases do pipe; cada fase
-- decide independentemente se aquele campo é obrigatório/visível nela. Isso
-- evita duplicar definição de campo por fase (CLAUDE.md §19: "evite
-- duplicação de código" aplicado a modelagem de dados) e é a abordagem mais
-- simples que ainda atende "campos obrigatórios podem ser validados na
-- mudança de fase" (CLAUDE.md §10).
--
-- Valor de cada campo por card fica em `card_field_values.value jsonb`
-- (migration separada) — CLAUDE.md §8: "não criar uma coluna física nova
-- para cada campo criado pelo usuário".

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid not null references public.pipes (id) on delete cascade,
  label text not null,
  field_key text not null,
  type text not null,
  help_text text,
  placeholder text,
  default_value jsonb,
  position integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fields_label_not_blank check (btrim(label) <> ''),
  constraint fields_key_format check (field_key ~ '^[a-z0-9_]+$'),
  constraint fields_pipe_key_unique unique (pipe_id, field_key),
  constraint fields_type_check check (
    type in (
      'short_text',
      'long_text',
      'number',
      'currency',
      'date',
      'datetime',
      'single_select',
      'multi_select',
      'checkbox',
      'email',
      'phone',
      'user',
      'attachment'
    )
  )
);

comment on table public.fields is
  'Definição de campo dinâmico de um pipe. Tipos suportados no M2: texto curto/longo, número, moeda, data, data/hora, seleção única/múltipla, checkbox, e-mail, telefone, usuário, anexo.';

create index if not exists fields_pipe_id_idx
  on public.fields (pipe_id);

drop trigger if exists set_fields_updated_at on public.fields;
create trigger set_fields_updated_at
  before update on public.fields
  for each row
  execute function public.set_updated_at();

alter table public.fields enable row level security;

-- ---------------------------------------------------------------------
-- field_options: opções de campos de seleção única/múltipla.
-- ---------------------------------------------------------------------

create table if not exists public.field_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields (id) on delete cascade,
  value text not null,
  label text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint field_options_value_not_blank check (btrim(value) <> ''),
  constraint field_options_label_not_blank check (btrim(label) <> ''),
  constraint field_options_field_value_unique unique (field_id, value)
);

comment on table public.field_options is
  'Opções disponíveis para campos do tipo single_select/multi_select.';

create index if not exists field_options_field_id_idx
  on public.field_options (field_id);

alter table public.field_options enable row level security;

-- ---------------------------------------------------------------------
-- phase_fields: associação campo <-> fase, com obrigatoriedade/visibilidade.
-- ---------------------------------------------------------------------

create table if not exists public.phase_fields (
  phase_id uuid not null references public.phases (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  is_required boolean not null default false,
  is_visible boolean not null default true,
  position integer not null default 0,
  primary key (phase_id, field_id)
);

comment on table public.phase_fields is
  'Configura, por fase, se um campo do pipe é obrigatório/visível. Usada por move_card() para validar campos obrigatórios ao sair de uma fase.';

create index if not exists phase_fields_field_id_idx
  on public.phase_fields (field_id);

alter table public.phase_fields enable row level security;

-- Garante que a fase e o campo associados pertencem ao mesmo pipe — não é
-- possível expressar isso com um `check constraint` simples entre tabelas,
-- então usamos um trigger de validação.
create or replace function public.check_phase_field_same_pipe()
returns trigger
language plpgsql
as $$
declare
  v_phase_pipe_id uuid;
  v_field_pipe_id uuid;
begin
  select pipe_id into v_phase_pipe_id from public.phases where id = new.phase_id;
  select pipe_id into v_field_pipe_id from public.fields where id = new.field_id;

  if v_phase_pipe_id is null or v_field_pipe_id is null then
    raise exception 'Fase ou campo inexistente.';
  end if;

  if v_phase_pipe_id <> v_field_pipe_id then
    raise exception 'A fase e o campo devem pertencer ao mesmo pipe.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_phase_field_same_pipe_trigger on public.phase_fields;
create trigger check_phase_field_same_pipe_trigger
  before insert or update on public.phase_fields
  for each row
  execute function public.check_phase_field_same_pipe();

-- ---------------------------------------------------------------------
-- field_conditionals: condicional simples (campo X depende de valor de Y).
-- ---------------------------------------------------------------------

create table if not exists public.field_conditionals (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields (id) on delete cascade,
  depends_on_field_id uuid not null references public.fields (id) on delete cascade,
  operator text not null default 'equals',
  value jsonb,
  created_at timestamptz not null default now(),
  constraint field_conditionals_not_self check (field_id <> depends_on_field_id),
  constraint field_conditionals_operator_check check (
    operator in ('equals', 'not_equals', 'contains', 'empty', 'not_empty')
  )
);

comment on table public.field_conditionals is
  'Condicional simples: field_id só é obrigatório/visível quando depends_on_field_id satisfaz operator/value. Avaliada na camada de validação de domínio (src/lib/validation), não bloqueia move_card no M2.';

create index if not exists field_conditionals_field_id_idx
  on public.field_conditionals (field_id);

create index if not exists field_conditionals_depends_on_field_id_idx
  on public.field_conditionals (depends_on_field_id);

alter table public.field_conditionals enable row level security;

create or replace function public.check_field_conditional_same_pipe()
returns trigger
language plpgsql
as $$
declare
  v_field_pipe_id uuid;
  v_depends_pipe_id uuid;
begin
  select pipe_id into v_field_pipe_id from public.fields where id = new.field_id;
  select pipe_id into v_depends_pipe_id from public.fields where id = new.depends_on_field_id;

  if v_field_pipe_id is null or v_depends_pipe_id is null then
    raise exception 'Campo inexistente.';
  end if;

  if v_field_pipe_id <> v_depends_pipe_id then
    raise exception 'Os campos de uma condicional devem pertencer ao mesmo pipe.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_field_conditional_same_pipe_trigger on public.field_conditionals;
create trigger check_field_conditional_same_pipe_trigger
  before insert or update on public.field_conditionals
  for each row
  execute function public.check_field_conditional_same_pipe();

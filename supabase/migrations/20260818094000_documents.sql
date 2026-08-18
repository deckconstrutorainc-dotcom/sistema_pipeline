-- M6 — Gestão e Analytics
-- `document_templates` + `generated_documents`: geração de documentos a
-- partir de um card, usando um template com placeholders (`{{field.key}}`,
-- `{{card.title}}`, ...) resolvidos por
-- `src/server/services/documents.ts#renderDocumentTemplate` (função pura,
-- testável sem DB/PDF — ver testes em tests/unit/documents.test.ts).
--
-- DECISÃO DE ESCOPO (documentada também no relatório de conclusão do
-- milestone): geração de PDF binário real está FORA do escopo deste
-- milestone para não introduzir uma dependência pesada (renderização de
-- PDF geralmente exige binário nativo ou lib grande) sem necessidade
-- técnica comprovada (CLAUDE.md §21). `generated_documents.storage_path`
-- aponta para um arquivo de TEXTO/HTML gerado a partir do template (mesmo
-- padrão de path multi-tenant de `attachments`:
-- `{organization_id}/{pipe_id}/{card_id}/...`), upload real depende do
-- bucket Supabase Storage estar configurado (mesma pendência de
-- infraestrutura já documentada em `attachments.sql`, M2). Geração de PDF
-- real fica para iteração futura.

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pipe_id uuid references public.pipes (id) on delete cascade,
  name text not null,
  description text,
  body text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_name_not_blank check (btrim(name) <> ''),
  constraint document_templates_body_not_blank check (btrim(body) <> '')
);

comment on table public.document_templates is
  'Template de documento com placeholders {{field.key}}/{{card.title}}/{{card.number}}/... resolvidos por renderDocumentTemplate(). pipe_id nullable: template pode ser genérico da organização ou específico de um pipe (quando específico, só placeholders {{field.*}} desse pipe fazem sentido, mas a validação de shape não impede placeholders inexistentes — eles apenas ficam sem substituição, ver comportamento documentado na função).';

create index if not exists document_templates_organization_id_idx
  on public.document_templates (organization_id);

create index if not exists document_templates_pipe_id_idx
  on public.document_templates (pipe_id);

drop trigger if exists set_document_templates_updated_at on public.document_templates;
create trigger set_document_templates_updated_at
  before update on public.document_templates
  for each row
  execute function public.set_updated_at();

alter table public.document_templates enable row level security;

create or replace function public.check_document_template_pipe_same_org()
returns trigger
language plpgsql
as $$
declare
  v_pipe_org_id uuid;
begin
  if new.pipe_id is null then
    return new;
  end if;

  select organization_id into v_pipe_org_id from public.pipes where id = new.pipe_id;

  if v_pipe_org_id is null then
    raise exception 'Pipe inexistente.';
  end if;

  if v_pipe_org_id <> new.organization_id then
    raise exception 'O pipe do template deve pertencer à mesma organização do template.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_document_template_pipe_same_org_trigger on public.document_templates;
create trigger check_document_template_pipe_same_org_trigger
  before insert or update on public.document_templates
  for each row
  execute function public.check_document_template_pipe_same_org();

-- ---------------------------------------------------------------------
-- generated_documents
--
-- Deliberadamente SEM policy de INSERT/UPDATE para `authenticated` (ver
-- migration de RLS): o client NUNCA insere uma linha "generated" simulando
-- sucesso. A única via de escrita é o server action
-- `generateDocument` (src/server/actions/documents.ts), que usa
-- createAdminClient() para: 1) inserir a linha com status 'pending',
-- 2) chamar renderDocumentTemplate() no servidor, 3) atualizar para
-- 'generated' (com storage_path) ou 'failed' (com error_message) — mesmo
-- padrão de "escrita só via service role em server action" já usado em
-- email_threads/email_messages (M5).
-- ---------------------------------------------------------------------

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  generated_by uuid not null references auth.users (id) on delete restrict,
  storage_path text,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  constraint generated_documents_status_check check (status in ('pending', 'generated', 'failed'))
);

comment on table public.generated_documents is
  'Registro de uma geração de documento a partir de um template + card. status pending -> generated|failed, escrito exclusivamente pelo server action generateDocument via service role (nunca INSERT direto do client com status=generated, evitando simular sucesso de uma geração que não ocorreu). storage_path é texto/HTML nesta fase (ver comentário no topo do arquivo sobre PDF real ser pendência futura).';

create index if not exists generated_documents_template_id_idx
  on public.generated_documents (template_id);

create index if not exists generated_documents_card_id_idx
  on public.generated_documents (card_id);

alter table public.generated_documents enable row level security;

-- Defesa em profundidade: garante que o card pertence ao mesmo pipe do
-- template (quando o template é específico de um pipe).
create or replace function public.check_generated_document_card_matches_template()
returns trigger
language plpgsql
as $$
declare
  v_template_pipe_id uuid;
  v_card_pipe_id uuid;
begin
  select pipe_id into v_template_pipe_id from public.document_templates where id = new.template_id;
  select pipe_id into v_card_pipe_id from public.cards where id = new.card_id;

  if v_card_pipe_id is null then
    raise exception 'Card inexistente.';
  end if;

  if v_template_pipe_id is not null and v_template_pipe_id <> v_card_pipe_id then
    raise exception 'O template é específico de outro pipe.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_generated_document_card_matches_template_trigger on public.generated_documents;
create trigger check_generated_document_card_matches_template_trigger
  before insert or update on public.generated_documents
  for each row
  execute function public.check_generated_document_card_matches_template();

-- M5 — Colaboração Externa
-- Superfície pública/anônima do sistema (CLAUDE.md §2/§7): três funções
-- SECURITY DEFINER, as ÚNICAS deste projeto com `grant ... to anon`. Todas
-- as três resolvem TUDO a partir de um slug/protocolo — nenhum parâmetro
-- permite escolher organização/pipe arbitrariamente, e nenhuma delas expõe
-- dado sensível de outro tenant.
--
-- 1. get_portal_public_config(slug)         -> lê config pública do portal
-- 2. submit_portal_request(...)             -> cria card + request (escrita)
-- 3. get_request_status_by_protocol(protocol) -> consulta de status
--
-- PENDÊNCIA REAL DE SEGURANÇA (documentada, não resolvida aqui — fora de
-- escopo sem infraestrutura de rate limiting/Redis/edge middleware):
-- nenhuma das três funções abaixo tem proteção contra abuso por volume
-- (spam de submissões, brute-force de protocolo/código de acesso). Em
-- produção isso precisa de rate limiting na borda (ex.: Vercel Edge
-- Middleware + KV, ou um WAF) antes do tráfego chegar até aqui — não dá
-- para resolver isso de forma real só com código de aplicação numa função
-- de banco. Ver relatório final para detalhamento.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. get_portal_public_config
-- ---------------------------------------------------------------------

create or replace function public.get_portal_public_config(p_slug text)
returns table (
  portal_id uuid,
  name text,
  description text,
  welcome_message text,
  visibility text,
  is_active boolean,
  field_id uuid,
  field_label text,
  field_type text,
  field_help_text text,
  field_placeholder text,
  field_position integer,
  is_required boolean,
  field_options jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as portal_id,
    p.name,
    p.description,
    p.welcome_message,
    p.visibility,
    p.is_active,
    f.id as field_id,
    f.label as field_label,
    f.type as field_type,
    f.help_text as field_help_text,
    f.placeholder as field_placeholder,
    pi.position as field_position,
    coalesce(
      pi.is_required_override,
      (
        select pf.is_required
        from public.phase_fields pf
        join public.phases ph on ph.id = pf.phase_id
        where ph.pipe_id = p.pipe_id and ph.is_initial = true and pf.field_id = f.id
        limit 1
      ),
      false
    ) as is_required,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('value', fo.value, 'label', fo.label) order by fo.position)
        from public.field_options fo
        where fo.field_id = f.id
      ),
      '[]'::jsonb
    ) as field_options
  from public.portals p
  left join public.portal_items pi on pi.portal_id = p.id
  left join public.fields f on f.id = pi.field_id and f.is_archived = false
  where p.slug = p_slug
  order by pi.position;
$$;

comment on function public.get_portal_public_config(text) is
  'Config pública de um portal para renderizar o formulário externo (nome, descrição, campos e obrigatoriedade). Não expõe dados de card/organização além do necessário para montar o formulário. Chamada sem autenticação (grant to anon).';

revoke all on function public.get_portal_public_config(text) from public;
grant execute on function public.get_portal_public_config(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. submit_portal_request
--
-- Fluxo (espelha CLAUDE.md §10, adaptado para criação em vez de
-- movimentação — mesma exigência de atomicidade e reversão em falha):
--   1. Resolve o portal pelo slug (nunca por id — o client nunca escolhe
--      organização/pipe diretamente).
--   2. Valida is_active e, se restricted, o código de acesso.
--   3. Resolve a fase inicial do pipe do portal.
--   4. Valida obrigatoriedade dos campos configurados em portal_items
--      (considerando is_required_override) — mesma semântica de "vazio"
--      usada por move_card() (M2) e validateFieldValue()/isFieldValueEmpty
--      (src/lib/validation/fields.ts). A validação de TIPO de cada campo
--      já aconteceu na camada de aplicação (route handler, reaproveitando
--      validateFieldValue) ANTES de chamar este RPC — mas o RPC segue
--      sendo a fonte de verdade final para obrigatoriedade e para nunca
--      gravar um field_id fora de portal_items.
--   5. Cria o card (atribuído ao criador do portal — não há usuário
--      autenticado para ser created_by; a origem real fica registrada em
--      card_activities.type = 'request_submitted').
--   6. Grava card_field_values SOMENTE para os fieldIds presentes em
--      portal_items (nunca aceita um field_id arbitrário do payload).
--   7. Gera protocolo único (retry em caso de colisão) e cria a request.
--   8. Registra card_activities (origem portal/request).
--   9. Tudo dentro desta função plpgsql = uma única transação implícita:
--      qualquer exceção reverte tudo (nenhum estado parcial).
-- ---------------------------------------------------------------------

create or replace function public.submit_portal_request(
  p_portal_slug text,
  p_field_values jsonb,
  p_requester_name text default null,
  p_requester_email text default null,
  p_access_code text default null,
  p_ip_hash text default null
)
returns table (card_id uuid, protocol text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_portal public.portals;
  v_initial_phase public.phases;
  v_card public.cards;
  v_protocol text;
  v_org_slug text;
  v_seq integer;
  v_attempt integer := 0;
  v_field record;
  v_value jsonb;
begin
  select * into v_portal from public.portals where slug = p_portal_slug;
  if v_portal.id is null then
    raise exception 'Portal não encontrado.';
  end if;

  if not v_portal.is_active then
    raise exception 'Este portal não está recebendo solicitações no momento.';
  end if;

  if v_portal.visibility = 'restricted' then
    if v_portal.access_code_hash is null then
      raise exception 'Portal restrito sem código de acesso configurado.';
    end if;
    if p_access_code is null or encode(digest(p_access_code, 'sha256'), 'hex') <> v_portal.access_code_hash then
      raise exception 'Código de acesso inválido.';
    end if;
  end if;

  select ph.* into v_initial_phase
  from public.phases ph
  where ph.pipe_id = v_portal.pipe_id and ph.is_initial = true
  limit 1;

  if v_initial_phase.id is null then
    raise exception 'Este portal não possui uma fase inicial configurada no pipe.';
  end if;

  -- Validação de obrigatoriedade — mesma semântica de "vazio" de move_card().
  for v_field in
    select
      pi.field_id,
      f.label,
      coalesce(
        pi.is_required_override,
        (
          select pf.is_required
          from public.phase_fields pf
          where pf.phase_id = v_initial_phase.id and pf.field_id = pi.field_id
        ),
        false
      ) as is_required
    from public.portal_items pi
    join public.fields f on f.id = pi.field_id and f.is_archived = false
    where pi.portal_id = v_portal.id
  loop
    v_value := p_field_values -> v_field.field_id::text;
    if v_field.is_required and (
      v_value is null
      or v_value = 'null'::jsonb
      or v_value = '""'::jsonb
      or v_value = '[]'::jsonb
    ) then
      raise exception 'Campo obrigatório não preenchido: %', v_field.label;
    end if;
  end loop;

  insert into public.cards (pipe_id, current_phase_id, title, created_by)
  values (
    v_portal.pipe_id,
    v_initial_phase.id,
    coalesce(nullif(btrim(p_requester_name), ''), 'Solicitação externa — ' || v_portal.name),
    v_portal.created_by
  )
  returning * into v_card;

  -- Só grava valores para campos explicitamente listados em portal_items —
  -- nunca aceita um field_id arbitrário vindo do payload público.
  insert into public.card_field_values (card_id, field_id, value)
  select v_card.id, pi.field_id, p_field_values -> pi.field_id::text
  from public.portal_items pi
  where pi.portal_id = v_portal.id
    and p_field_values ? pi.field_id::text;

  select o.slug into v_org_slug from public.organizations o where o.id = v_portal.organization_id;

  select count(*) into v_seq
  from public.requests r
  join public.portals p2 on p2.id = r.portal_id
  where p2.organization_id = v_portal.organization_id
    and r.submitted_at::date = (now() at time zone 'utc')::date;

  loop
    v_attempt := v_attempt + 1;
    -- organizations.slug aceita hífens (`^[a-z0-9]+(-[a-z0-9]+)*$`), mas
    -- requests.protocol exige `^[A-Z0-9]+-[0-9]{8}-[0-9]{4,}$` (sem hífen no
    -- primeiro segmento) — remove os hífens do slug antes de montar o
    -- protocolo para nunca violar o check constraint com um slug realista
    -- de múltiplas palavras (ex.: "acme-corp").
    v_protocol := regexp_replace(upper(v_org_slug), '[^A-Z0-9]', '', 'g') || '-'
      || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-'
      || lpad((v_seq + v_attempt)::text, 4, '0');

    begin
      insert into public.requests (portal_id, card_id, protocol, requester_name, requester_email, ip_hash)
      values (
        v_portal.id,
        v_card.id,
        v_protocol,
        nullif(btrim(p_requester_name), ''),
        nullif(btrim(p_requester_email), ''),
        p_ip_hash
      );
      exit;
    exception when unique_violation then
      if v_attempt > 20 then
        raise exception 'Não foi possível gerar um protocolo único. Tente novamente.';
      end if;
    end;
  end loop;

  insert into public.card_activities (card_id, actor_id, type, payload)
  values (
    v_card.id,
    null,
    'request_submitted',
    jsonb_build_object('portal_id', v_portal.id, 'protocol', v_protocol)
  );

  return query select v_card.id, v_protocol;
end;
$$;

comment on function public.submit_portal_request(text, jsonb, text, text, text, text) is
  'Único ponto de escrita público/anônimo do sistema: cria card + card_field_values + request a partir da submissão de um formulário de portal, em uma única transação. Resolve organização/pipe exclusivamente a partir do slug — nenhum parâmetro permite escolher organização/pipe arbitrários. PENDÊNCIA: sem rate limiting (ver comentário no topo do arquivo).';

revoke all on function public.submit_portal_request(text, jsonb, text, text, text, text) from public;
grant execute on function public.submit_portal_request(text, jsonb, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. get_request_status_by_protocol
--
-- Retorna SOMENTE campos seguros: protocolo, status derivado (não o nome
-- interno completo de fases sensíveis — mas o nome da fase é considerado
-- seguro aqui pois é informação operacional do próprio processo do
-- solicitante, não dado de outro tenant) e data de submissão. NUNCA
-- retorna o card inteiro, título, campos ou qualquer coisa de outro
-- protocolo — a busca é sempre por igualdade exata de protocolo (que já
-- inclui o "namespace" da organização no próprio texto).
-- ---------------------------------------------------------------------

create or replace function public.get_request_status_by_protocol(p_protocol text)
returns table (
  protocol text,
  status text,
  phase_name text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.protocol,
    case
      when c.is_archived then 'archived'
      when c.is_done then 'completed'
      else 'in_progress'
    end as status,
    ph.name as phase_name,
    r.submitted_at
  from public.requests r
  join public.cards c on c.id = r.card_id
  join public.phases ph on ph.id = c.current_phase_id
  where r.protocol = p_protocol;
$$;

comment on function public.get_request_status_by_protocol(text) is
  'Consulta pública de status de uma solicitação pelo protocolo, sem autenticação. Retorna apenas protocolo/status/fase/data — nunca o card inteiro. Isolamento entre tenants garantido pela unicidade global do protocolo (sem esse valor exato não há acesso a nenhum dado).';

revoke all on function public.get_request_status_by_protocol(text) from public;
grant execute on function public.get_request_status_by_protocol(text) to anon, authenticated;

-- Seed de desenvolvimento local.
--
-- M1: papéis fixos do sistema, permissões básicas e o mapeamento
-- role_permissions. Idempotente (ON CONFLICT DO NOTHING / DO UPDATE) para
-- poder ser reaplicado em `supabase db reset` sem duplicar dados.

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------

insert into public.roles (key, name, description, is_system)
values
  ('super_admin', 'Super Admin', 'Acesso total à organização, incluindo configurações críticas e gestão de outros administradores.', true),
  ('admin', 'Admin', 'Gestão operacional completa da organização, exceto ações reservadas ao Super Admin.', true),
  ('member', 'Member', 'Uso operacional padrão: cria e edita o que lhe é atribuído dentro dos pipes.', true),
  ('read_only', 'Read Only', 'Acesso somente leitura a todo o conteúdo da organização.', true),
  ('restricted', 'Restricted', 'Acesso de leitura limitado a itens explicitamente atribuídos.', true),
  ('guest', 'Guest', 'Acesso mínimo, tipicamente para colaboração pontual/externa.', true)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      is_system = excluded.is_system;

-- ---------------------------------------------------------------------
-- Permissions
-- Mantidas simples e extensíveis para os próximos milestones (M2+).
-- ---------------------------------------------------------------------

insert into public.permissions (key, description)
values
  ('organization.manage', 'Editar configurações da organização.'),
  ('organization.delete', 'Excluir a organização.'),
  ('member.invite', 'Convidar novos membros para a organização.'),
  ('member.remove', 'Remover membros da organização.'),
  ('member.view', 'Visualizar membros da organização.'),
  ('role.assign', 'Alterar o papel de um membro.'),
  ('group.manage', 'Criar, editar e excluir grupos.'),
  ('pipe.manage', 'Criar, editar e arquivar pipes (placeholder para M2).'),
  ('pipe.view', 'Visualizar pipes e seus cards (placeholder para M2).'),
  ('card.manage', 'Criar, editar e mover cards (placeholder para M2).'),
  ('report.view', 'Visualizar relatórios e dashboards (placeholder para M6).')
on conflict (key) do update
  set description = excluded.description;

-- ---------------------------------------------------------------------
-- Role x Permission
-- ---------------------------------------------------------------------

-- Super Admin: todas as permissões existentes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

-- Admin: tudo exceto excluir a organização.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key in (
    'organization.manage',
    'member.invite',
    'member.remove',
    'member.view',
    'role.assign',
    'group.manage',
    'pipe.manage',
    'pipe.view',
    'card.manage',
    'report.view'
  )
where r.key = 'admin'
on conflict do nothing;

-- Member: operacional, sem gestão de organização/membros.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key in (
    'member.view',
    'pipe.view',
    'card.manage',
    'report.view'
  )
where r.key = 'member'
on conflict do nothing;

-- Read Only: apenas leitura.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key in (
    'member.view',
    'pipe.view',
    'report.view'
  )
where r.key = 'read_only'
on conflict do nothing;

-- Restricted: leitura limitada (sem relatórios agregados).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key in (
    'pipe.view'
  )
where r.key = 'restricted'
on conflict do nothing;

-- Guest: mínimo, sem permissões administrativas ou de gestão.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.key in (
    'pipe.view'
  )
where r.key = 'guest'
on conflict do nothing;

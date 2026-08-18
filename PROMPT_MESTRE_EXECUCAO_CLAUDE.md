# Prompt Mestre — Execução do Plano do Sistema

Leia integralmente antes de alterar qualquer arquivo:

1. `CLAUDE.md`
2. toda a especificação funcional/técnica disponível em `/docs`
3. estrutura atual do repositório
4. migrations existentes
5. configuração do Supabase
6. package.json e dependências atuais

## Objetivo

Construir uma plataforma independente de gestão de processos e workflows, inspirada funcionalmente em soluções como Pipefy, seguindo rigorosamente a especificação do projeto.

Não copie identidade visual, textos, marca, assets ou código proprietário de terceiros.

O objetivo é implementar uma plataforma própria, modular, segura, multi-tenant e escalável.

---

## Regra principal de execução

NÃO IMPLEMENTE TODO O SISTEMA DE UMA VEZ.

Execute o projeto rigorosamente por milestones:

- M0 — Fundação
- M1 — Segurança e Tenant
- M2 — Workflow Core
- M3 — Automação
- M4 — Data Hub
- M5 — Colaboração Externa
- M6 — Gestão e Analytics
- M7 — Ecosystem
- M8 — Intelligence

Antes de iniciar, determine qual é o milestone atual analisando o estado real do repositório.

Se o projeto estiver vazio ou em estágio inicial, comece por M0 e M1.

Não avance automaticamente para o próximo milestone enquanto os critérios de aceite do milestone atual não estiverem cumpridos.

---

# FASE 1 — Inspeção

Antes de escrever código:

1. analise a estrutura do repositório;
2. identifique o que já existe;
3. identifique código que pode ser reutilizado;
4. verifique migrations;
5. verifique RLS;
6. verifique configurações de autenticação;
7. verifique variáveis de ambiente;
8. identifique conflitos entre o estado atual e a especificação.

Não altere arquivos nesta fase.

Apresente um resumo curto contendo:

- milestone identificado;
- situação atual;
- principais lacunas;
- arquivos que provavelmente serão criados ou alterados;
- migrations necessárias;
- riscos técnicos relevantes.

Depois prossiga com a implementação sem pedir nova confirmação, salvo se existir bloqueio técnico impossível de resolver sem informação externa.

---

# FASE 2 — Implementação

Implemente somente o milestone atual.

Siga rigorosamente o `CLAUDE.md`.

## Regras obrigatórias

- TypeScript strict.
- Não use `any` sem justificativa.
- Toda mudança de banco exige migration.
- RLS obrigatória.
- Nenhuma service role no browser.
- Toda operação multi-tenant deve validar organization.
- Preserve histórico.
- Registre auditoria quando necessário.
- Reutilize componentes.
- Regras de negócio ficam no servidor/domínio.
- Não introduza mocks permanentes.
- Não copie UI do Pipefy.
- Não remova funcionalidades existentes para simplificar a implementação.
- Não faça refactors amplos sem necessidade direta para o milestone.

---

# M0 — FUNDAÇÃO

Se M0 ainda não estiver concluído, implementar:

- Next.js App Router
- TypeScript strict
- Tailwind
- shadcn/ui
- estrutura de diretórios
- layout base
- Supabase client/server
- `.env.example`
- ESLint
- Prettier
- scripts de lint/typecheck/test/build
- configuração inicial de testes
- CI básico
- tratamento inicial de erro
- página de login
- página inicial autenticada vazia/estrutural

Critério de aceite:

- aplicação inicia localmente;
- conexão Supabase configurada;
- build passa;
- lint passa;
- typecheck passa;
- secrets não estão commitados.

---

# M1 — SEGURANÇA E TENANT

Se M0 estiver concluído, implementar M1:

## Banco

Criar via migrations:

- organizations
- profiles
- organization_memberships
- roles
- permissions
- role_permissions
- groups
- group_members

## Auth

Implementar:

- login
- logout
- sessão
- recuperação básica de senha quando aplicável
- onboarding
- criação da primeira organização
- convite/entrada em organização quando aplicável
- troca de organização

## Papéis iniciais

Criar:

- Super Admin
- Admin
- Member
- Read Only
- Restricted
- Guest

## Segurança

Implementar RLS em todas as tabelas.

Criar helpers de autorização quando necessário.

Testar com pelo menos:

- Organização A
- Organização B
- usuário da Organização A
- usuário da Organização B

Garantir que nenhum usuário consiga consultar ou alterar dados de outro tenant.

Critério de aceite:

- autenticação funcionando;
- criação/seleção de organização funcionando;
- memberships funcionando;
- roles funcionando;
- RLS funcionando;
- teste cruzado entre tenants aprovado;
- build, lint, typecheck e testes aprovados.

NÃO avance para Pipes enquanto M1 não estiver estável.

---

# M2 — WORKFLOW CORE

Quando M1 estiver concluído:

Criar:

- pipes
- pipe_memberships
- phases
- fields
- field_options
- field_conditionals
- cards
- card_field_values
- card_assignments
- labels
- card_labels
- comments
- attachments
- card_activities

Implementar:

## Pipes

- criar
- editar
- arquivar
- listar
- controlar acesso

## Fases

- criar
- editar
- ordenar
- excluir com validação
- definir inicial
- definir final
- SLA por fase

## Campos

Tipos iniciais:

- texto curto
- texto longo
- número
- moeda
- data
- data/hora
- seleção única
- seleção múltipla
- checkbox
- e-mail
- telefone
- usuário
- anexo

Implementar:

- obrigatório
- opcional
- valor padrão
- ajuda
- placeholder
- validação
- condicionais
- arquivamento

## Cards

Implementar:

- criação
- edição
- responsáveis
- labels
- prazo
- comentários
- anexos
- histórico
- arquivamento
- conclusão

## Kanban

Implementar:

- colunas por fase
- drag-and-drop com dnd-kit
- movimento transacional
- validação de campos obrigatórios
- rollback em falha
- abertura de card em drawer/página
- URL compartilhável
- indicadores de SLA/prazo

Critério de aceite:

- admin cria pipe;
- cria fases;
- cria campos;
- usuário autorizado cria card;
- card pode ser movido;
- movimento é bloqueado quando requisito não é atendido;
- histórico registra movimentação;
- tenant isolation continua funcionando;
- build/testes passam.

---

# M3 — AUTOMAÇÃO

Após M2:

Criar:

- domain_events
- jobs
- automations
- automation_runs

Implementar arquitetura:

Evento → Condições → Ações

Triggers iniciais:

- card.created
- card.moved
- card.field.updated
- card.overdue
- phase.sla.exceeded

Conditions:

- equals
- not_equals
- contains
- empty
- not_empty
- greater_than
- less_than

Actions iniciais:

- move_card
- update_field
- assign_user
- add_label
- send_notification

Requisitos:

- processamento assíncrono;
- logs;
- retries;
- idempotência;
- prevenção de loops;
- status de execução;
- reprocessamento seguro.

Critério de aceite:

- evento cria automation run;
- condição é avaliada;
- ação executa;
- erro é registrado;
- retry funciona;
- execução duplicada não gera efeito duplicado indevido.

---

# M4 — DATA HUB

Implementar:

- databases
- database_fields
- records
- record_values
- connections

Recursos:

- CRUD de database
- CRUD de registro
- pesquisa
- filtros
- conexão card ↔ record
- conexão card ↔ card
- autofill
- permissões

---

# M5 — COLABORAÇÃO EXTERNA

Implementar:

- portals
- portal_items
- requests
- tasks
- email_templates
- email_threads
- email_messages

Recursos:

- portal público/restrito
- formulário externo
- acompanhamento de solicitação
- protocolo
- tarefas
- e-mail vinculado a card
- templates
- histórico

---

# M6 — GESTÃO E ANALYTICS

Implementar:

- reports
- dashboards
- dashboard_widgets
- interfaces
- interface_components
- document_templates
- generated_documents

Recursos:

- relatórios
- filtros
- exportação
- gráficos
- KPIs
- interfaces personalizadas
- geração de PDF

---

# M7 — ECOSYSTEM

Implementar:

- integrations
- integration_credentials
- webhooks
- adapters

Primeiros conectores:

- HTTP/Webhook
- e-mail
- Google/Microsoft
- assinatura eletrônica

Requisitos:

- secrets protegidos;
- idempotência;
- retries;
- logs;
- validação de webhook.

---

# M8 — INTELLIGENCE

Implementar:

- ai_agents
- knowledge_sources
- ai_runs

Recursos:

- extração de dados
- classificação
- resumo
- preenchimento assistido
- AI Agents
- knowledge base
- tools autorizadas
- logs
- uso/custo
- evidências
- human-in-the-loop

Nunca permitir que IA ignore autorização.

---

# FASE 3 — Testes e validação

Antes de considerar o milestone concluído:

Execute:

1. lint
2. typecheck
3. testes unitários relevantes
4. testes de integração relevantes
5. testes E2E críticos
6. build de produção

Corrija todos os erros introduzidos pela implementação.

Não esconda erros com casts inseguros, `any`, disables ou suppressions sem justificativa.

---

# FASE 4 — Relatório de conclusão

Ao terminar o milestone, apresente um relatório curto e objetivo contendo:

## Implementado
- funcionalidades concluídas

## Banco
- migrations criadas
- tabelas alteradas
- policies RLS criadas

## Código
- principais arquivos criados/alterados

## Segurança
- validações implementadas
- testes de tenant/RLS realizados

## Testes
- lint
- typecheck
- unit
- integration
- E2E
- build

Informe PASS/FAIL.

## Pendências
Liste apenas pendências reais.

## Próximo milestone
Informe qual milestone deve ser executado em seguida.

Não avance automaticamente para ele.

---

# Regra final

Não optimize para velocidade de geração de código.

Optimize para:

1. segurança;
2. correção;
3. integridade dos dados;
4. arquitetura sustentável;
5. consistência;
6. manutenibilidade.

O objetivo não é produzir o maior volume de código possível.

O objetivo é construir uma base robusta que permita evoluir a plataforma por muitos módulos sem reescrever sua fundação.

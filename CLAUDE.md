# CLAUDE.md

## 1. Objetivo do projeto

Construir uma plataforma independente de gestão de processos e workflows, inspirada funcionalmente em produtos de mercado como Pipefy, porém com identidade, arquitetura, textos, componentes e código próprios.

A plataforma deverá evoluir para suportar, entre outros casos de uso:

- Gestão de Contratos
- Gestão de Licitações
- Gestão de Empreiteiros
- Gestão de EPIs
- Gestão de Equipamentos
- Processos administrativos internos
- Portais de solicitações
- Automação de fluxos
- Relatórios e dashboards
- Integrações externas
- Recursos de Inteligência Artificial

A especificação funcional e técnica do projeto deve ser tratada como fonte de verdade para requisitos de produto.

---

## 2. Stack obrigatória

### Frontend
- Next.js com App Router
- React
- TypeScript em modo strict
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- dnd-kit para drag-and-drop

### Backend e dados
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security (RLS)

### Deploy
- Vercel para a aplicação
- Supabase para banco, autenticação e storage

### Testes
- Vitest ou Jest para testes unitários
- Playwright para testes E2E

### Qualidade
- ESLint
- Prettier
- TypeScript strict
- CI em pull requests

---

## 3. Regras obrigatórias de desenvolvimento

1. Leia a especificação do projeto antes de alterar arquitetura, banco ou regras de negócio.

2. Trabalhe por módulos e milestones.

3. Não tente implementar toda a plataforma em uma única etapa.

4. Preserve compatibilidade com funcionalidades já concluídas.

5. TypeScript strict é obrigatório.

6. Não use `any` sem justificativa técnica clara.

7. Toda alteração de banco de dados deve possuir migration versionada.

8. Nunca altere diretamente o schema de produção sem migration.

9. Nunca desative RLS apenas para fazer uma funcionalidade funcionar.

10. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ou credenciais administrativas no navegador.

11. Toda consulta multi-tenant deve respeitar `organization_id`.

12. Toda entidade de negócio deve pertencer direta ou indiretamente a uma organização.

13. Não confie em ocultação de elementos no frontend como mecanismo de segurança.

14. Regras de autorização devem existir no servidor e, quando aplicável, nas policies RLS.

15. Não use dados mockados como implementação final quando existir persistência real.

16. Mocks são permitidos apenas em testes, protótipos temporários ou desenvolvimento claramente identificado.

17. Regras de negócio não devem ficar espalhadas dentro de componentes React.

18. Prefira services, domain functions, repositories e funções reutilizáveis.

19. Evite duplicação de código.

20. Reutilize componentes existentes sempre que fizer sentido.

21. Não crie dependências grandes sem necessidade técnica comprovada.

22. Não apague dados históricos quando arquivamento ou soft delete forem suficientes.

23. Mudanças críticas devem gerar histórico/auditoria.

24. Automações devem ser idempotentes.

25. Automações devem possuir logs de execução.

26. Integrações externas devem possuir tratamento de erros e retries quando aplicável.

27. Toda ação crítica executada por IA deve ser controlada pelo servidor.

28. IA nunca deve acessar o banco diretamente sem ferramentas e validações autorizadas.

29. Ações críticas de IA podem exigir aprovação humana.

30. Não copie UI pixel a pixel, identidade visual, textos, logotipos ou assets do Pipefy.

---

## 4. Ordem de prioridade técnica

Sempre priorize nesta ordem:

1. Segurança
2. Integridade de dados
3. Regras de negócio
4. Estabilidade
5. Manutenibilidade
6. Experiência do usuário
7. Performance
8. Otimizações prematuras

---

## 5. Arquitetura esperada

Organize o projeto preferencialmente desta forma:

```text
src/
  app/
    (auth)/
    (app)/
      dashboard/
      pipes/
      databases/
      automations/
      portals/
      reports/
      interfaces/
      tasks/
      settings/
    api/

  components/
    ui/
    layout/
    forms/
    kanban/
    cards/
    reports/

  features/
    auth/
    organizations/
    pipes/
    cards/
    fields/
    automations/
    databases/
    portals/
    analytics/
    documents/
    integrations/
    ai/

  lib/
    supabase/
    auth/
    permissions/
    events/
    jobs/
    email/
    storage/
    validation/

  server/
    services/
    repositories/
    actions/
    queries/

  types/
  tests/

supabase/
  migrations/
  seed.sql
  functions/

docs/
  architecture/
  adr/
```

A estrutura pode ser ajustada quando houver justificativa técnica, mas os limites de domínio devem ser preservados.

---

## 6. Regras multi-tenant

A aplicação deve ser multi-tenant desde o início.

### Regras obrigatórias

- Toda organização possui seu próprio conjunto lógico de dados.
- Usuários podem participar de uma ou mais organizações.
- Cada operação deve saber qual organização está ativa.
- Dados de uma organização nunca podem vazar para outra.
- Testes de RLS devem usar no mínimo dois tenants.
- Toda tabela de negócio deve possuir `organization_id` ou relação inequívoca com uma entidade que possua.
- Consultas administrativas também devem respeitar autorização.

---

## 7. Segurança e RLS

Para cada nova tabela de negócio:

1. Criar migration.
2. Ativar RLS.
3. Criar policies.
4. Definir quem pode:
   - SELECT
   - INSERT
   - UPDATE
   - DELETE
5. Criar testes de acesso autorizado.
6. Criar testes de acesso negado.
7. Testar acesso cruzado entre tenants.

Nunca considerar uma tabela pronta sem revisar RLS.

---

## 8. Banco de dados

### Padrões

- IDs preferencialmente UUID.
- Datas armazenadas em UTC.
- `created_at` e `updated_at` em entidades relevantes.
- `created_by` e `updated_by` quando necessário.
- Foreign Keys devem ser explícitas.
- Criar índices quando houver consultas frequentes.
- Não usar `float` para valores monetários.
- Preferir `numeric` ou menor unidade monetária.
- Campos dinâmicos devem ser modelados com definição de campo + valores.
- Não criar uma coluna física nova para cada campo criado pelo usuário.

---

## 9. Workflow

O núcleo da plataforma deverá ser modelado como:

```text
Organization
  └── Pipe
       ├── Phases
       ├── Fields
       ├── Cards
       ├── Automations
       └── Members / Permissions
```

Cada card deve possuir:

- ID
- número sequencial
- título
- processo
- fase
- campos
- responsáveis
- etiquetas
- prazo
- comentários
- anexos
- conexões
- histórico
- auditoria

---

## 10. Movimentação de cards

Ao mover um card entre fases:

1. Validar autenticação.
2. Validar autorização.
3. Validar regras da fase.
4. Validar campos obrigatórios.
5. Validar condicionais.
6. Atualizar a fase em transação.
7. Registrar atividade.
8. Registrar domain event.
9. Enfileirar automações.
10. Atualizar interface.

Se houver falha, a movimentação deve ser revertida.

---

## 11. Motor de automações

Modelo:

```text
Evento
  ↓
Condições
  ↓
Ações
```

### Exemplos de eventos

- card.created
- card.moved
- card.field.updated
- card.due.soon
- card.overdue
- phase.sla.exceeded
- email.received
- record.created
- record.updated

### Regras

- Persistir evento antes de processar automação.
- Processamento preferencialmente assíncrono.
- Registrar automation run.
- Registrar sucesso, falha e motivo.
- Implementar retries.
- Implementar idempotência.
- Prevenir loops.
- Usar `correlation_id` e/ou `causation_id` quando necessário.

---

## 12. UX/UI

### Layout

- Sidebar esquerda persistente.
- Topbar com busca, organização, notificações e usuário.
- Conteúdo principal responsivo.

### Navegação principal

- Dashboard
- Pipes
- Databases
- Automations
- Portals
- Tasks
- Reports
- Dashboards
- Interfaces
- Settings

### Kanban

- Fases em colunas.
- Drag-and-drop.
- Contagem de cards.
- Responsáveis.
- SLA e atrasos.
- Campos resumidos configuráveis.
- Cards abertos em drawer lateral quando apropriado.
- URL do card deve ser compartilhável.

### Estados

Sempre implementar:

- loading
- empty
- success
- error
- forbidden

Nunca deixar telas vazias sem orientação.

---

## 13. Componentes

Antes de criar componente novo:

1. Verifique se já existe equivalente.
2. Verifique se pode ser generalizado.
3. Verifique shadcn/ui.
4. Evite componentes gigantes.
5. Separe apresentação de lógica de negócio.

---

## 14. Formulários

Use:

- React Hook Form
- Zod

Todo campo deve possuir validação consistente no frontend e servidor.

Campos dinâmicos devem possuir schema validado.

Campos obrigatórios devem ser verificados antes de mudança de fase quando configurados dessa forma.

---

## 15. Arquivos

- Usar Supabase Storage.
- Buckets privados para arquivos de negócio.
- Path deve considerar `organization_id`.
- Downloads por signed URLs após autorização.
- Validar tamanho e mime type.
- Nunca confiar no nome original como identificador único.

---

## 16. Integrações

Integrações devem usar adapters.

Exemplo:

```ts
interface EmailProvider {
  send(...)
}

interface AIProvider {
  generate(...)
}

interface SignatureProvider {
  createEnvelope(...)
}
```

Não espalhar lógica específica de provider pelo domínio.

---

## 17. Inteligência Artificial

IA deve ser uma camada desacoplada.

### Regras

- Provider substituível.
- Ferramentas controladas pelo servidor.
- Respeitar permissões.
- Registrar execuções.
- Registrar modelo utilizado.
- Registrar uso/custo quando disponível.
- Registrar evidências quando extrair dados de documentos.
- Não sobrescrever dados críticos sem regra explícita.
- Human-in-the-loop para ações críticas quando necessário.

---

## 18. Auditoria

Registrar eventos relevantes como:

- criação
- atualização
- mudança de fase
- atribuição
- alteração de prazo
- comentário
- anexo
- automação
- integração
- ação de IA
- mudança de permissão
- exclusão/arquivamento

Auditoria deve incluir:

- organização
- usuário ou origem
- ação
- entidade
- data/hora
- before
- after

---

## 19. Testes mínimos

### Unitários
- validação de campos
- condicionais
- permissões
- cálculo de SLA
- transições

### Integração
- criação de cards
- movimentação
- RLS
- automações
- databases

### E2E
- login
- criar pipe
- criar card
- mover card
- impedir movimento por campo obrigatório
- preencher requisito
- mover card
- consultar histórico

---

## 20. Antes de considerar uma tarefa concluída

Execute obrigatoriamente:

```bash
lint
typecheck
tests relevantes
build
```

Corrija qualquer erro introduzido pela própria alteração.

Não declare uma etapa como concluída enquanto esses checks não passarem.

---

## 21. Definition of Done

Uma funcionalidade só é considerada concluída quando:

- implementação finalizada;
- migration criada, quando necessária;
- RLS revisada;
- permissões revisadas;
- validações implementadas;
- tratamento de erros implementado;
- histórico/auditoria implementado quando necessário;
- testes adicionados ou atualizados;
- lint aprovado;
- typecheck aprovado;
- build aprovado;
- documentação atualizada quando necessário.

---

## 22. Ordem obrigatória de implementação

### M0 — Fundação
- bootstrap
- Next.js
- TypeScript
- UI base
- Supabase
- CI
- variáveis de ambiente

### M1 — Segurança e Tenant
- Auth
- Organizations
- Memberships
- Roles
- Permissions
- Groups
- RLS

### M2 — Workflow Core
- Pipes
- Phases
- Fields
- Cards
- Assignments
- Labels
- Comments
- Attachments
- History
- Kanban

### M3 — Automação
- Domain events
- Jobs
- Automation engine
- Automation runs
- Logs
- Retries

### M4 — Data Hub
- Databases
- Records
- Connections
- Autofill

### M5 — Colaboração externa
- Portals
- Forms externos
- Requests
- Tasks
- Email

### M6 — Gestão e Analytics
- Reports
- Dashboards
- Interfaces
- Documents
- PDF

### M7 — Ecosystem
- Webhooks
- Integration Hub
- assinatura eletrônica
- conectores

### M8 — Intelligence
- AI automation
- extração
- classificação
- AI Agents
- Knowledge Base
- Human-in-the-loop

Não avançar automaticamente para o próximo milestone sem concluir os critérios de aceite do atual.

---

## 23. Processo de trabalho esperado do Claude Code

Antes de alterar código:

1. Inspecione o repositório.
2. Leia este `CLAUDE.md`.
3. Leia a especificação relevante em `/docs`.
4. Identifique o milestone atual.
5. Liste brevemente os arquivos/migrations que serão afetados.
6. Verifique impactos em segurança, RLS e compatibilidade.

Durante a implementação:

- faça mudanças incrementais;
- reutilize código;
- preserve padrões existentes;
- não reescreva módulos estáveis sem necessidade.

Após implementar:

1. Revise a própria alteração.
2. Rode checks.
3. Corrija falhas.
4. Informe objetivamente:
   - o que mudou;
   - migrations adicionadas;
   - testes adicionados;
   - pontos pendentes;
   - próximo passo recomendado.

---

## 24. Proibições

É proibido:

- reconstruir o sistema inteiro em um único prompt;
- desativar RLS;
- expor secrets;
- usar service role no browser;
- copiar UI proprietária;
- apagar histórico sem necessidade;
- criar schema diretamente sem migration;
- ignorar testes de autorização;
- marcar como concluído código que não compila;
- esconder erros com `any`, casts inseguros ou suppressions desnecessárias;
- introduzir mock permanente para evitar implementação real.

---

## 25. Regra final

Em caso de ambiguidade, escolha a solução mais simples que preserve:

1. segurança;
2. integridade;
3. multi-tenancy;
4. extensibilidade;
5. consistência arquitetural.

Se uma decisão puder afetar significativamente o futuro do projeto, registre-a em `/docs/adr`.

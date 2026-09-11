# Sistema de Gestão de Atividades e Processos (modelo Pipefy)

**Especificação técnica e plano de construção — do zero, em código**
Perfil: 6 a 20 usuários · escopo completo (formulário + kanban/SLA + automações + relatórios)

---

## 0. Antes de tudo: o conceito que define o projeto inteiro

Ferramentas como Pipefy, Jira e Monday **não são aplicações com telas fixas**. Elas são *motores de workflow dirigidos por metadados*.

A diferença é radical:

| Abordagem | O que você codifica | Consequência |
|---|---|---|
| **App tradicional** | "Processo de Compras" com telas de compras | Cada processo novo = novo desenvolvimento |
| **Motor de workflow** (Pipefy) | Um interpretador de *definições* de processo | Processo novo = configuração, sem código |

No segundo modelo, "Processo de Compras" não existe no código. Existem as tabelas `pipe`, `phase`, `field_definition` e `card` — e o processo de compras é apenas **um registro de dados** dentro delas. A interface se monta dinamicamente lendo essa configuração.

**Essa é a decisão nº 1 do projeto.** Ela multiplica o esforço inicial por 2 a 3 vezes, mas é o que torna o sistema reutilizável. Como você pediu explicitamente "modelo Pipefy", este documento assume o motor de workflow.

> ⚠️ **Se você só precisa de 2 ou 3 processos estáveis que raramente mudam**, o motor genérico é over-engineering. Nesse caso, hardcode os processos e economize meses. Vale revisar essa premissa antes de começar.

### Premissas que adotei (me corrija se estiver errado)

1. Sistema **interno** da empresa, não um SaaS para vender a terceiros.
2. Uma organização só (mas o modelo já nasce multi-tenant por segurança).
3. Você ou um time pequeno vai desenvolver; não há equipe grande de engenharia.
4. Hospedagem própria (VPS/nuvem), não ambiente corporativo engessado.

### Limite da minha base de conhecimento

Descrevo aqui **como sistemas dessa categoria são construídos**, com base em arquitetura de software e nos comportamentos visíveis do Pipefy. Não tenho acesso ao código-fonte interno do Pipefy e não afirmo como eles implementaram internamente. Versões de bibliotecas e preços de serviços podem ter mudado desde minha última atualização — confirme antes de fechar decisões de stack.

---

## 1. Arquitetura e stack recomendada

### 1.1 Visão geral

```
┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend   │────▶│   API REST   │────▶│ PostgreSQL  │
│ React + TS   │     │ NestJS + TS  │     │   (JSONB)   │
└──────────────┘     └──────┬───────┘     └─────────────┘
                            │
                     ┌──────▼───────┐     ┌─────────────┐
                     │ Fila BullMQ  │────▶│    Redis    │
                     │  (workers)   │     └─────────────┘
                     └──────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      SLA scheduler    Automações       E-mail/Webhook
```

### 1.2 Escolhas e justificativas

| Camada | Recomendação | Por quê |
|---|---|---|
| **Banco** | PostgreSQL 16+ | JSONB para campos dinâmicos + SQL relacional forte para relatórios. É o único item realmente inegociável aqui. |
| **Backend** | NestJS (Node + TypeScript) | Estrutura modular opinativa, injeção de dependência, ótimo para motores de regra. Alternativa igualmente válida: **FastAPI (Python)** se seu time for Python. |
| **ORM** | Prisma ou Drizzle | Drizzle lida melhor com SQL bruto (você vai precisar para relatórios). |
| **Frontend** | React + TypeScript + Vite | Ecossistema maduro para o que é difícil aqui: kanban e form builder. |
| **Estado servidor** | TanStack Query | Cache, revalidação e otimismo no drag-and-drop. |
| **Drag & drop** | `dnd-kit` | Acessível, performático, mantido. |
| **UI** | Tailwind + shadcn/ui | Componentes que você possui no repositório, sem lock-in. |
| **Fila/jobs** | BullMQ + Redis | Obrigatório: SLA, automações e e-mails **não podem** rodar no request HTTP. |
| **Auth** | JWT próprio + refresh, ou Keycloak | Para 20 usuários, JWT próprio + bcrypt/argon2 é suficiente. |
| **Arquivos** | S3-compatível (MinIO, R2, S3) | URLs pré-assinadas; nunca sirva anexos pelo backend. |
| **Tempo real** | SSE ou WebSocket (Socket.io) | Com 20 usuários, até *polling* de 10s funcionaria — mas SSE é barato e melhora muito a sensação de time. |
| **Deploy** | Docker Compose em VPS | 20 usuários cabem folgadamente em 2 vCPU / 4 GB. Kubernetes seria desperdício. |
| **Observabilidade** | Sentry + logs estruturados (pino) | O motor de automação vai falhar; você precisa ver onde. |

---

## 2. Modelagem de dados — o núcleo do sistema

Esta é a parte que, se errada, custa uma reescrita. Leia com atenção.

### 2.1 O dilema dos campos dinâmicos

Cada processo tem campos diferentes. Existem três formas de guardar isso:

| Estratégia | Como funciona | Prós | Contras |
|---|---|---|---|
| **EAV** (`card_field_value`) | Uma linha por campo preenchido | Consultas e agregações simples por campo; integridade referencial | Muitos JOINs; ler um card = N linhas |
| **JSONB único** (`card.data`) | Todos os valores num objeto JSON | Leitura de card em 1 query; flexível | Agregação e filtro exigem índices GIN e cuidado |
| **Híbrido** | JSONB como fonte da verdade + tabela EAV derivada para relatórios | Melhor dos dois | Precisa manter sincronizado (trigger ou job) |

**Recomendação: comece com JSONB puro.** Para 20 usuários e volumes na casa de dezenas de milhares de cards, JSONB + índices GIN resolve tudo. Migre para o híbrido **somente** quando os relatórios começarem a ficar lentos — e aí você já saberá exatamente quais campos indexar.

A validação dos valores acontece no **backend**, gerando um schema Zod dinamicamente a partir das `field_definition` do pipe. O banco garante a forma (é JSON válido); a aplicação garante o conteúdo.

### 2.2 Entidades

**Identidade e organização**
- `organization` — tenant raiz
- `user` — pessoa (e-mail, senha hash, nome, avatar)
- `membership` — usuário ↔ organização, com papel global (`owner`, `admin`, `member`, `guest`)

**Definição do processo (metadados — mudam raramente)**
- `pipe` — o processo. Nome, ícone, descrição, se tem formulário público
- `phase` — fase/coluna. Ordem, tipo (`start`, `normal`, `done`), política de SLA, limite de WIP
- `field_definition` — campo. Pertence a um `pipe` (formulário inicial) **ou** a uma `phase` (campos da fase)
- `pipe_member` — quem tem acesso a este pipe e com que papel
- `label` — etiquetas do pipe

**Execução (dados — mudam o tempo todo)**
- `card` — o item que caminha pelo processo
- `card_phase_history` — **a tabela mais importante para relatórios.** Registra cada entrada e saída de fase
- `card_assignee` — responsáveis (N:N)
- `card_label` — etiquetas aplicadas
- `comment` — comentários com menções
- `attachment` — anexos (chave S3, nome, tamanho, mime)
- `checklist_item` — subtarefas dentro de um card
- `card_connection` — vínculo entre cards de pipes diferentes

**Motor de regras**
- `automation` — gatilho + condições + ações
- `automation_run` — log de execução (essencial para depurar)
- `webhook_endpoint` — integrações de saída
- `api_key` — integrações de entrada

**Suporte**
- `activity_log` — auditoria imutável de tudo
- `notification` — notificações in-app
- `business_calendar` / `holiday` — horário útil e feriados, para o SLA

### 2.3 DDL do núcleo (PostgreSQL)

```sql
-- ============ DEFINIÇÃO DO PROCESSO ============

CREATE TABLE pipe (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  public_form     BOOLEAN NOT NULL DEFAULT FALSE,
  public_form_token TEXT UNIQUE,
  calendar_id     UUID REFERENCES business_calendar(id),
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE phase (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipe_id     UUID NOT NULL REFERENCES pipe(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'normal'
              CHECK (kind IN ('start','normal','done','canceled')),
  sla_minutes INTEGER,                  -- NULL = sem SLA nesta fase
  sla_mode    TEXT NOT NULL DEFAULT 'business'
              CHECK (sla_mode IN ('business','calendar')),
  wip_limit   INTEGER,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pipe_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE field_definition (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipe_id       UUID NOT NULL REFERENCES pipe(id) ON DELETE CASCADE,
  phase_id      UUID REFERENCES phase(id) ON DELETE CASCADE, -- NULL = form inicial
  key           TEXT NOT NULL,          -- chave estável usada no JSONB
  label         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'short_text','long_text','number','currency','date','datetime',
                  'select','multi_select','checkbox','email','phone','url',
                  'user','attachment','connection','formula','cpf_cnpj'
                )),
  options       JSONB,                  -- itens de select, config de fórmula etc.
  required_to_enter BOOLEAN NOT NULL DEFAULT FALSE,
  required_to_move  BOOLEAN NOT NULL DEFAULT FALSE,
  editable_after_move BOOLEAN NOT NULL DEFAULT TRUE,
  visibility_rule JSONB,                -- lógica condicional
  position      INTEGER NOT NULL,
  help_text     TEXT,
  UNIQUE (pipe_id, key)
);

-- ============ EXECUÇÃO ============

CREATE TABLE card (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organization(id),
  pipe_id          UUID NOT NULL REFERENCES pipe(id),
  current_phase_id UUID NOT NULL REFERENCES phase(id),
  seq              BIGINT NOT NULL,     -- número legível: #142
  title            TEXT NOT NULL,
  data             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','done','canceled')),
  position         NUMERIC NOT NULL,    -- ordem dentro da fase (ver 2.4)
  due_date         TIMESTAMPTZ,         -- prazo do card inteiro
  phase_due_at     TIMESTAMPTZ,         -- prazo do SLA da fase atual
  phase_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES "user"(id),
  source           TEXT NOT NULL DEFAULT 'app'
                   CHECK (source IN ('app','public_form','api','email','automation')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pipe_id, seq)
);

CREATE INDEX idx_card_board   ON card (pipe_id, current_phase_id, position)
                               WHERE status = 'open';
CREATE INDEX idx_card_data    ON card USING GIN (data jsonb_path_ops);
CREATE INDEX idx_card_sla     ON card (phase_due_at)
                               WHERE status = 'open' AND phase_due_at IS NOT NULL;

-- A tabela que sustenta TODOS os relatórios
CREATE TABLE card_phase_history (
  id             BIGSERIAL PRIMARY KEY,
  card_id        UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  phase_id       UUID NOT NULL REFERENCES phase(id),
  entered_at     TIMESTAMPTZ NOT NULL,
  exited_at      TIMESTAMPTZ,
  duration_sec   INTEGER,               -- preenchido na saída
  business_sec   INTEGER,               -- duração em horário útil
  sla_due_at     TIMESTAMPTZ,
  sla_breached   BOOLEAN,
  moved_by       UUID REFERENCES "user"(id),
  moved_by_automation UUID REFERENCES automation(id)
);

CREATE INDEX idx_cph_card  ON card_phase_history (card_id, entered_at);
CREATE INDEX idx_cph_phase ON card_phase_history (phase_id, entered_at);

-- ============ AUTOMAÇÃO ============

CREATE TABLE automation (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipe_id      UUID NOT NULL REFERENCES pipe(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
                 'card_created','card_moved','card_entered_phase','field_changed',
                 'sla_breaching','sla_breached','card_done','scheduled','comment_added'
               )),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditions   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- AST, nunca string de código
  actions      JSONB NOT NULL,                      -- lista ordenada
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE automation_run (
  id            BIGSERIAL PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES automation(id) ON DELETE CASCADE,
  card_id       UUID REFERENCES card(id) ON DELETE SET NULL,
  status        TEXT NOT NULL CHECK (status IN ('success','failed','skipped')),
  depth         SMALLINT NOT NULL DEFAULT 0,   -- proteção anti-loop
  detail        JSONB,
  error         TEXT,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4 Detalhe que economiza dor: ordenação do kanban

Não use `INTEGER` sequencial para `card.position` — mover um card obrigaria a reescrever a coluna inteira. Use **`NUMERIC` com posicionamento fracionário**: ao soltar um card entre dois outros de posição `100` e `200`, grave `150`. Apenas uma linha é atualizada.

A cada ~1000 movimentações na mesma fase, rode um job de *rebalanceamento* que reescreve as posições em múltiplos de 1000, evitando que a precisão decimal se esgote.

### 2.5 Versionamento de definição de pipe

**Armadilha clássica:** o usuário exclui um campo que já foi preenchido em 400 cards. O que acontece com os dados?

Regra: `field_definition` **nunca é deletada** — recebe `archived_at`. O valor permanece no `data` do card e continua visível em modo somente-leitura. Mudar o `type` de um campo é proibido; a interface obriga a criar um campo novo.

---

## 3. Motor de fases: a máquina de estados

### 3.1 Regras de transição

Ao mover um card de A para B, o backend valida **em transação**:

1. O usuário tem permissão no pipe?
2. A fase de destino pertence ao mesmo pipe?
3. Todos os campos de A com `required_to_move = true` estão preenchidos? → se não, **HTTP 422 com a lista dos campos faltantes**, e o frontend abre o modal pedindo o preenchimento (é exatamente o comportamento do Pipefy).
4. A fase B estourou o `wip_limit`? → bloqueia ou avisa, conforme configuração.
5. Fecha o registro em `card_phase_history` (grava `exited_at`, `duration_sec`, `business_sec`, `sla_breached`).
6. Abre novo registro de histórico, atualiza `current_phase_id`, `phase_entered_at` e recalcula `phase_due_at`.
7. Publica o evento `card.moved` na fila.

> O passo 7 é a chave da arquitetura: **a movimentação nunca executa automação diretamente**. Ela só emite um evento. Isso impede que uma automação lenta ou quebrada trave a interface do usuário.

### 3.2 SLA com horário útil — onde quase todo projeto erra

Calcular `phase_due_at = agora + 8 horas` é errado quando o card entra na fase às 17h de uma sexta-feira. O prazo cairia no sábado.

Você precisa de um **calendário de negócio**:

```
business_calendar: timezone, jornada por dia da semana (ex.: seg-sex 08:00-12:00, 13:00-18:00)
holiday: data, nome, calendar_id
```

E de duas funções puras, bem testadas, no backend:

- `addBusinessTime(inicio, minutos, calendario) → Date` — calcula o vencimento
- `businessDurationBetween(a, b, calendario) → segundos` — mede o tempo real gasto

**Escreva testes unitários para essas duas funções antes de escrever o resto.** Casos: virada de fim de semana, feriado no meio, entrada fora do expediente, intervalo de almoço, horário de verão.

### 3.3 Monitoramento de SLA

Um job recorrente (a cada 5 minutos) busca:

```sql
SELECT id, pipe_id, current_phase_id FROM card
WHERE status = 'open'
  AND phase_due_at IS NOT NULL
  AND phase_due_at <= now() + interval '1 hour'
  AND sla_notified_at IS NULL;
```

E emite os eventos `sla.breaching` (prestes a vencer) e `sla.breached` (vencido). O índice parcial `idx_card_sla` mantém essa query barata mesmo com muitos cards.

---

## 4. Formulário de entrada e triagem

### 4.1 Formulário público

- URL com token opaco: `/f/{public_form_token}` — não expõe IDs internos
- Renderização dinâmica a partir das `field_definition` do pipe (`phase_id IS NULL`)
- **Lógica condicional**: `visibility_rule` no formato `{"field": "tipo_solicitacao", "op": "eq", "value": "compra"}` — o campo só aparece se a regra for verdadeira. Avalie a mesma regra no backend; nunca confie no frontend.
- Proteções obrigatórias: rate limit por IP, honeypot ou Turnstile, limite de tamanho de anexo, validação de MIME real (não pela extensão)
- Confirmação por e-mail com link de acompanhamento (token de leitura do card)

### 4.2 Triagem automática

Triagem é só um caso particular de automação, disparada por `card_created`:

| Estratégia | Como configurar |
|---|---|
| Por campo | `SE data.departamento = 'TI' ENTÃO atribuir a @joao` |
| Round-robin | Ação `assign_round_robin` sobre um grupo de usuários, com ponteiro persistido |
| Por carga | Atribuir ao membro com menos cards abertos no pipe |
| Por prioridade | `SE data.urgencia = 'alta' ENTÃO mover para fase "Urgente" E definir sla 4h` |

---

## 5. Motor de automações

### 5.1 Modelo conceitual

```
GATILHO (quando) → CONDIÇÕES (se) → AÇÕES (então)
```

**Gatilhos**: `card_created`, `card_moved`, `card_entered_phase`, `field_changed`, `sla_breaching`, `sla_breached`, `card_done`, `comment_added`, `scheduled` (cron).

**Condições** como AST em JSON — **jamais** `eval()` ou string de código:

```json
{
  "op": "and",
  "children": [
    { "op": "eq",  "field": "data.departamento", "value": "Compras" },
    { "op": "gt",  "field": "data.valor",        "value": 10000 },
    { "op": "in",  "field": "card.labels",       "value": ["urgente"] }
  ]
}
```

Um avaliador recursivo percorre essa árvore. Operadores: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `is_empty`, `is_not_empty`, `changed_to`.

**Ações**: `move_to_phase`, `assign_user`, `set_field`, `add_label`, `create_card` (em outro pipe, com mapeamento de campos), `connect_card`, `send_email`, `call_webhook`, `post_comment`, `notify_user`, `set_due_date`.

### 5.2 Execução — os quatro requisitos inegociáveis

1. **Assíncrona.** Evento → fila BullMQ → worker. A resposta HTTP do usuário não espera a automação.
2. **Proteção contra loop.** "Ao entrar na fase A, mover para B" + "ao entrar em B, mover para A" = laço infinito que derruba o servidor. Cada evento carrega um `depth`; ao ultrapassar **5**, o worker aborta, marca `automation_run.status = 'failed'` e desabilita a automação.
3. **Idempotência.** Chave de job = `hash(automation_id + card_id + event_id)`. Retry do BullMQ não pode criar cards duplicados.
4. **Ordem determinística.** Automações do mesmo gatilho executam por `position`. Ações dentro de uma automação executam em sequência; se uma falhar, as seguintes são puladas e o erro é registrado.

### 5.3 Depuração

`automation_run` com `detail` em JSONB guardando o snapshot das condições avaliadas e o resultado de cada ação. Sem isso, você vai passar noites tentando descobrir por que um card não se moveu. A tela "Histórico de automações" do pipe é uma feature de produto, não um luxo de desenvolvedor.

---

## 6. Integrações

| Tipo | Implementação | Cuidado |
|---|---|---|
| **Webhook de saída** | POST JSON com header `X-Signature: sha256=HMAC(segredo, body)` | Retry exponencial (1min, 5min, 30min); desativar após N falhas |
| **API de entrada** | REST + OpenAPI, autenticação por `api_key` com escopo por pipe | Rate limit por chave |
| **E-mail transacional** | Resend, SES ou SMTP | Fila separada; template por tipo de notificação |
| **E-mail de entrada** | Endereço por pipe (`pipe-xyz@dominio`) que cria card do assunto/corpo | Opcional; adiciona complexidade real (parsing MIME, anti-spam) |
| **Planilhas** | Exportação CSV/XLSX e importação em lote com pré-visualização | Importação sempre com *dry run* antes de gravar |

---

## 7. Relatórios e indicadores

### 7.1 Métricas que importam

| Indicador | Definição | Origem |
|---|---|---|
| **Lead time** | Criação → conclusão | `card.created_at` até último histórico com fase `done` |
| **Cycle time por fase** | Tempo dentro de cada fase | `card_phase_history.business_sec` |
| **Throughput** | Cards concluídos por semana | contagem em `card_phase_history` |
| **WIP** | Cards abertos por fase | `card` com `status='open'` |
| **Aderência ao SLA** | % de fases concluídas dentro do prazo | `sla_breached = false` ÷ total |
| **Gargalo** | Fase com maior cycle time mediano | percentil 50 e 85 por fase |
| **CFD** | Cumulative Flow Diagram — cards por fase ao longo do tempo | série diária derivada do histórico |
| **Aging WIP** | Cards abertos há mais tempo que o p85 histórico | o indicador mais acionável no dia a dia |

### 7.2 Use percentis, não médias

A média de cycle time é enganosa — uma única exceção de 30 dias distorce tudo. Reporte **mediana (p50) e p85**. O p85 é o número que serve para prometer prazo ao cliente interno: "85% das solicitações são resolvidas em até X dias".

```sql
SELECT p.name,
       COUNT(*) AS total,
       ROUND(percentile_cont(0.5)  WITHIN GROUP (ORDER BY h.business_sec)/3600.0, 1) AS p50_horas,
       ROUND(percentile_cont(0.85) WITHIN GROUP (ORDER BY h.business_sec)/3600.0, 1) AS p85_horas,
       ROUND(100.0 * AVG((NOT COALESCE(h.sla_breached,false))::int), 1) AS pct_sla_ok
FROM card_phase_history h
JOIN phase p ON p.id = h.phase_id
WHERE h.exited_at IS NOT NULL
  AND h.entered_at >= now() - interval '90 days'
  AND p.pipe_id = $1
GROUP BY p.name, p.position
ORDER BY p.position;
```

### 7.3 Estratégia de performance

Comece com queries diretas. Quando passarem de ~500 ms, crie **views materializadas** com `REFRESH MATERIALIZED VIEW CONCURRENTLY` a cada hora. Só construa um data mart de verdade se o volume justificar — com 20 usuários, provavelmente nunca vai justificar.

---

## 8. Segurança, permissões e LGPD

### 8.1 Permissões em três níveis

1. **Organização**: `owner`, `admin`, `member`, `guest`
2. **Pipe**: `pipe_member` define quem vê e edita cada processo
3. **Campo**: `field_definition.visibility_rule` pode restringir campos sensíveis (ex.: salário visível só para RH)

Aplique o filtro **na query**, nunca na renderização. Toda consulta de card inclui `organization_id = :orgId` e verificação de pipe — considere `ROW LEVEL SECURITY` do PostgreSQL como rede de segurança adicional.

### 8.2 LGPD (contexto brasileiro)

- `activity_log` imutável registrando quem viu e alterou dados pessoais
- Política de retenção configurável por pipe (ex.: arquivar cards concluídos há mais de 5 anos)
- Rotina de anonimização (substituir dados pessoais por hash) em vez de exclusão física, preservando os indicadores históricos
- Se houver formulário público, informe a finalidade do tratamento na própria tela
- Anexos com URLs pré-assinadas de curta duração (5–15 min), nunca públicas

---

## 9. Roadmap de implementação

Estimativa para **1 desenvolvedor full-stack experiente, em tempo integral**. Com um time de 2, reduza cerca de 35% (não 50% — há coordenação).

| Fase | Entregas | Semanas |
|---|---|---|
| **0 — Fundação** | Repositório, Docker Compose, migrations, auth (login/refresh/RBAC), CI, healthcheck | 2 |
| **1 — Metamodelo + Kanban** | CRUD de pipe/phase/field, board com dnd-kit, detalhe do card, comentários, anexos, activity log | 5 |
| **2 — Formulário + SLA** | Form builder, formulário público, lógica condicional, calendário de negócio, cálculo e alerta de SLA | 4 |
| **3 — Automações** | Motor gatilho/condição/ação, fila, anti-loop, tela de configuração, log de execuções | 5 |
| **4 — Relatórios** | Dashboard, métricas do item 7, CFD, exportação CSV/XLSX, filtros salvos | 3 |
| **5 — Integrações** | Webhooks assinados, API pública + OpenAPI, e-mail transacional | 2 |
| **6 — Hardening** | Testes E2E, backup automatizado, Sentry, LGPD, documentação, treinamento | 3 |
| | **Total até produção** | **~24 semanas (≈ 5,5 meses)** |

### Corte para MVP em 8 semanas

Se precisar de valor rápido, entregue **Fases 0 + 1 + parte da 2** e aceite estas limitações temporárias:
- SLA em horas corridas (sem calendário de negócio)
- Sem automações — triagem manual
- Relatórios apenas como exportação CSV
- Formulário interno, sem lógica condicional

Isso já substitui planilhas e grupos de WhatsApp para 20 pessoas, e é o suficiente para validar se o modelo de processo está certo antes de investir nas fases caras.

---

## 10. Riscos e armadilhas

| Risco | Impacto | Mitigação |
|---|---|---|
| **Over-engineering do metamodelo** | Meses gastos em flexibilidade nunca usada | Limite os tipos de campo do MVP a 8; adicione sob demanda real |
| **Loop de automação** | Servidor derrubado, dados corrompidos | `depth` máximo 5 + desativação automática (item 5.2) |
| **SLA sem horário útil** | Perda de confiança nos indicadores | Funções puras testadas antes de tudo (item 3.2) |
| **Relatório sobre dados dinâmicos** | Queries lentas | `card_phase_history` desde o dia 1 — não dá para reconstruir histórico depois |
| **Alterar definição com cards ativos** | Perda de dados | Soft delete de campos, tipo imutável (item 2.5) |
| **Board com muitos cards** | Frontend travando | Paginação por fase (50 cards) + virtualização + contador total |
| **Adoção** | Sistema perfeito, ninguém usa | Comece por **um** processo com dono claro; só expanda após 4 semanas de uso real |
| **Escopo vs. build-vs-buy** | 5 meses para reconstruir o que custaria R$ X/mês | Reavalie honestamente a decisão do item 0 antes da Fase 3 |

---

## 11. Critérios de aceite do MVP

- [ ] Admin cria um pipe com 5 fases e 10 campos sem tocar em código
- [ ] Usuário cria card pelo formulário e ele aparece na fase inicial
- [ ] Mover card com campo `required_to_move` vazio é bloqueado com mensagem clara
- [ ] Card que entra em fase com SLA recebe `phase_due_at` correto (validado com entrada às 17h de sexta)
- [ ] Card vencido aparece destacado no board e gera notificação
- [ ] `card_phase_history` registra cada movimentação com duração em horário útil
- [ ] Automação "ao criar card com valor > 10.000, atribuir ao gestor" funciona e aparece no log
- [ ] Relatório mostra p50 e p85 por fase dos últimos 90 dias
- [ ] Usuário sem acesso ao pipe recebe 404 (não 403 — não revele a existência)
- [ ] Backup diário restaurado com sucesso em ambiente limpo

---

## 12. Próximos passos imediatos

1. **Revalidar o item 0** — confirme que você precisa mesmo do motor genérico, e não de 2 ou 3 processos fixos.
2. **Mapear o primeiro processo real** no papel: fases, campos por fase, prazos, responsáveis, regras. Esse desenho vira o teste do seu modelo de dados.
3. **Escolher backend**: NestJS ou FastAPI — decida pelo que seu time domina, não pelo que é "melhor".
4. **Implementar o calendário de negócio** com testes. É a peça mais isolada e mais sujeita a bugs sutis.
5. **Subir a Fase 0** e validar o fluxo de deploy antes de escrever regra de negócio.

---

*Documento gerado como especificação de referência. As estimativas de prazo pressupõem dedicação integral e são a parte mais incerta deste plano — trate-as como ordem de grandeza, não como compromisso.*

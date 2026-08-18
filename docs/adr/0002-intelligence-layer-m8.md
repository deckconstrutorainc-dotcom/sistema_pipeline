# ADR 0002 — Camada de Intelligence (M8): provider, execução sem sessão, allowlist e busca textual

- **Status**: Aceita
- **Data**: 2026-08-18
- **Milestone**: M8 — Intelligence (último milestone do roadmap M0–M8)

## Contexto

M8 introduz a primeira camada de IA da plataforma (`ai_agents`, `knowledge_sources`,
`ai_runs`, `ai_run_evidences`), com exigências explícitas do `CLAUDE.md` §17/§27/§28:
IA nunca acessa o banco diretamente sem ferramentas e validações autorizadas, toda ação
crítica é controlada pelo servidor, e ações críticas podem exigir aprovação humana.
Várias decisões de design tinham mais de uma alternativa razoável e afetam como o
milestone evolui no futuro (ex.: adicionar mais tools, trocar de provider, adotar busca
semântica) — registradas aqui em vez de só em comentários de código.

## Decisões

### 1. Provider default: Anthropic (`claude-opus-5`), nunca fallback simulado

`AIProvider` é uma interface desacoplada (`src/lib/ai/types.ts`); `getAIProvider()`
sempre retorna `AnthropicProvider` em produção. Sem `ANTHROPIC_API_KEY` configurada, a
chamada falha com erro explícito — nunca cai para `NullAIProvider` (que existe só para
uso explícito em testes/dev). Preço/modelo ficam isolados dentro do provider
(`PRICING_USD_PER_MILLION_TOKENS`), nunca vazam para o domínio.

### 2. `ai-run-processor.ts` roda sem sessão de usuário — mesma decisão de `automation-processor.ts` (M3)

O processamento assíncrono (`POST /api/ai/process`, protegido por `CRON_SECRET`) não
tem uma sessão de usuário autenticado disponível (é um worker, não uma requisição de
um navegador logado). Isso significa que as tools em `tool-registry.ts` não podem
chamar os server actions "use server" existentes (`updateCardFields`, `searchRecords`
etc.) diretamente — esses dependem de `createClient()` vinculado a cookies de sessão.
A solução adotada, consistente com `automation-processor.ts`: as tools usam o client
ADMIN (service role) e reimplementam a MESMA validação de negócio já usada pelos
server actions (`validateFieldValue`, mesma tolerância a `23505`, mesmo formato de
`card_activities`) — nunca inventam uma regra nova, mas também não são literalmente a
mesma função TypeScript.

**Consequência aceita**: toda tool 'write'/'critical' precisa reimplementar sua própria
checagem de "o ator é membro da organização e o card pertence a ela" em vez de herdar
isso de `requireAuth()`/RLS de sessão — é isso que a "defesa em profundidade" exigida
pelo `CLAUDE.md` §17 pede explicitamente. A checagem cobre associação à organização e
isolamento de tenant, mas NÃO reimplementa a política completa de pipe restrito
(`is_pipe_member`, M2, que considera `pipe_memberships`) — simplificação documentada,
suficiente porque a autorização "de verdade" já aconteceu em `triggerAiRun` (que roda
com sessão real).

### 3. `ai_runs` falho é TERMINAL — sem retry automático (diferente de `automation_runs`/`webhook_deliveries`)

Automações e webhooks retentam falhas automaticamente (têm `attempt`/`max_attempts`).
`ai_runs` deliberadamente NÃO tem essas colunas: uma chamada de IA tem custo monetário
real por tentativa, então uma falha fica visível para um humano decidir se dispara uma
NOVA execução — reprocessar automaticamente geraria custo sem supervisão. O job da fila
(`jobs`, `job_type='ai_run'`) é marcado `succeeded` sempre que `processAiRun` retorna
normalmente, mesmo que o RESULTADO da run seja `failed` — o processamento em si não
falhou, o outcome de negócio que falhou.

### 4. Allowlist de tools como `text[]` simples, validada em três camadas

`ai_agents.allowed_tools` é um `text[]` sem FK para uma tabela de tools (não existe
"tabela de tools" no banco — as tools são código, definidas em
`src/lib/ai/tool-catalog.ts`/`tool-registry.ts`). A integridade é garantida em três
pontos independentes, nenhum dos quais confia isoladamente: (1) Zod
(`createAiAgentSchema`) valida contra `TOOL_NAMES` ao salvar o agente; (2)
`tool-registry.ts` falha ao carregar se um nome do catálogo não tiver implementação
registrada; (3) `resolveAllowedTool()` é o ÚNICO ponto de resolução que
`ai-run-processor.ts` usa — um tool_call fora da allowlist nunca chega a `execute()`,
mesmo que a tool exista no registro. Alternativa descartada: uma tabela `ai_tools` no
banco com FK — rejeitada porque tools são código server-only (têm `execute()`), não
dados; modelá-las como linha de tabela criaria a falsa impressão de que um admin
poderia "criar uma tool" via UI sem escrever código.

### 5. Busca em `knowledge_sources`: texto simples, não vetorial/semântica

Fora do escopo deste milestone por exigir infraestrutura adicional (`pgvector` +
geração de embeddings via um provider). `selectRelevantKnowledge()`
(`ai-run-engine.ts`) pontua por contagem de substring/palavra-chave — suficiente para
poucas dezenas de fontes curtas, mas não escala nem entende sinônimos. Evolução natural
documentada como pendência, não implementada aqui.

## Alternativas consideradas

- **Dar às tools acesso ao client de sessão do usuário que disparou a run** (guardando
  o JWT do usuário na run): rejeitado — guardar um token de sessão de usuário em uma
  tabela persistente é um risco de segurança (token de longa duração armazenado em
  texto) e ainda expiraria antes da aprovação humana (que pode levar minutos/horas).
- **Deixar tools 'critical' sempre bloqueadas** (nunca configurável): rejeitado — o
  `CLAUDE.md` pede "pode exigir aprovação", não "sempre exige"; `requires_approval` por
  agente permite um caso de uso totalmente automatizado quando o time confia no agente.
- **Retry automático para `ai_runs` como automation_runs**: rejeitado pelo argumento de
  custo monetário acima.

## Consequências

- Adicionar uma nova tool exige: entrada em `TOOL_CATALOG`, implementação em
  `TOOL_IMPLEMENTATIONS` (`tool-registry.ts`) com schema Zod + JSON Schema, e nenhuma
  mudança de schema de banco — a allowlist já aceita qualquer nome presente no catálogo.
- Trocar de provider de IA no futuro significa implementar `AIProvider` e trocar a
  instância em `getAIProvider()` — nenhum outro arquivo do domínio conhece
  `AnthropicProvider` diretamente.
- Migrar `knowledge_sources` para busca vetorial exigirá uma nova migration
  (`pgvector`, coluna de embedding) e trocar `selectRelevantKnowledge()` — a interface
  (lista de fontes com `id`/`name`/`excerpt`) pode permanecer.

## Referências

- `CLAUDE.md` §16/§17/§27/§28.
- `src/server/services/automation-processor.ts` (mesma decisão de execução sem sessão, M3).
- `supabase/migrations/20260818094900_ai_agents.sql` até `20260818095400_intelligence_rls_policies.sql`.

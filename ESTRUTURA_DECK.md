# Koryn Task — Estrutura Operacional da DECK Construtora

Sistema interno de gestão de atividades da equipe.

---

## 1. Usuários e perfis de acesso

| Nome | Setor | E-mail | Perfil |
|---|---|---|---|
| **Bruno** | Diretoria | bruno@deckconstrutora.com.br | Super Admin |
| Cristiane | Financeiro | financeiro@deckconstrutora.com.br | Member |
| Isabele | Compras | compras@deckconstrutora.com.br | Member |
| Josi | RH / DP / Administrativo | deck@deckconstrutora.com.br | Member |
| Stephanie | RH / DP / Administrativo | recepcao@deckconstrutora.com.br | Member |
| Higor | Orçamentos | orcamento@deckconstrutora.com.br | Member |

**Senha inicial de todos:** `Deck@2026` — cada um deve trocar no primeiro acesso.

### Perfis disponíveis

| Perfil | Alcance |
|---|---|
| **Super Admin** | Tudo, incluindo gestão de outros administradores |
| **Admin** | Gestão operacional completa: cria processos, edita fases e campos, gerencia membros |
| **Member** | Cria e trabalha nas atividades dos processos a que tem acesso |
| **Read Only** | Só leitura |
| **Restricted** | Leitura apenas do que lhe foi atribuído |
| **Guest** | Acesso mínimo, para colaboração pontual |

### Permissões por perfil

| Ação | Super Admin | Admin | Member |
|---|---|---|---|
| Ver todos os processos | ✓ | ✓ | conforme acesso |
| Criar e excluir usuários | ✓ | ✓ | — |
| Alterar permissões | ✓ | ✓ | — |
| Criar/editar fases e campos | ✓ | ✓ | — |
| Criar atividades | ✓ | ✓ | ✓ |
| Editar e transferir atividades | ✓ | ✓ | ✓ |
| Arquivar atividades | ✓ | ✓ | ✓ |
| Ver indicadores da equipe | ✓ | ✓ | próprios |

As permissões são aplicadas **no banco** (Row Level Security do PostgreSQL),
não apenas escondendo botões na tela. Um usuário sem acesso a um processo
recebe "não encontrado" — o sistema não revela sequer que ele existe.

---

## 2. Processos por setor

### Financeiro — Cristiane
`Nova demanda` → `Aguardando documentos` → `Em análise` → `Programado para
pagamento` → `Pago` → `Aguardando baixa ou conciliação` → **Concluído**

Prazos: nova demanda 24h · análise 48h · conciliação 72h

Campos próprios: Valor · Fornecedor/Favorecido · Vencimento · Forma de
pagamento · Centro de custo/Obra

### Compras — Isabele
`Solicitação recebida` → `Cotação` → `Aguardando propostas` → `Análise de
fornecedores` → `Aprovação` → `Pedido emitido` → `Aguardando entrega` →
`Material recebido` → **Concluído**

Prazos: solicitação 24h · cotação 48h · análise 48h · aprovação 24h

Campos próprios: Material/Serviço · Quantidade · Valor estimado ·
Fornecedor escolhido · Obra/Destino · Previsão de entrega

### RH / DP / Administrativo — Josi e Stephanie
`Nova solicitação` → `Aguardando documentação` → `Em análise` → `Em
processamento` → `Aguardando assinatura ou aprovação` → **Finalizado**

Prazos: nova solicitação 24h · análise 48h · processamento 72h

Campos próprios: Tipo de solicitação (admissão, demissão, férias, atestado,
benefícios, documentação, ponto, treinamento) · Colaborador envolvido ·
Obra/Setor · Documento de referência

### Orçamentos — Higor
`Nova oportunidade` → `Em análise` → `Aguardando documentos` → `Levantamento
de quantitativos` → `Cotação` → `Composição de custos` → `Montagem da
proposta` → `Revisão` → `Proposta enviada` → `Aguardando resultado` →
**Ganho** / **Perdido**

Prazos: oportunidade 24h · análise 48h · levantamento 120h · cotação 72h ·
composição 72h · montagem 48h · revisão 24h

Campos próprios: Cliente · Objeto/Escopo · Valor da proposta · Entrega da
proposta · Origem · Concorrentes · Motivo da perda

> As fases que dependem de terceiros (aguardando documentos, propostas,
> entrega, resultado) **não têm prazo**, de propósito: cobrar atraso de quem
> não controla a espera gera indicador falso.

---

## 3. Campos das atividades

Presentes em todos os quatro processos:

| Campo | Onde vive |
|---|---|
| Título | Coluna do card |
| Descrição | Campo (obrigatório) |
| Prioridade | Campo (obrigatório) — Urgente, Alta, Normal, Baixa |
| Solicitante | Campo |
| Setor solicitante | Campo |
| Data de conclusão | Campo |
| Observações | Campo |
| Setor | O próprio processo |
| Responsável | Atribuição do card (aceita mais de um) |
| Status | Fase atual do card |
| Data de criação | Automática |
| Prazo | Campo próprio do card, com alerta de vencimento |
| Anexos | Aba do card ⚠️ |
| Histórico de alterações | Aba do card, automático |
| Comentários | Aba do card |
| Checklist | Aba do card |
| Atividades relacionadas | Conexões entre cards |

**Etiquetas** disponíveis em todos: Urgente · Alta · Normal · Baixa ·
Aguardando terceiros · Retrabalho

---

## 4. Integração entre setores

Uma atividade pode gerar outra em qualquer processo, e as duas ficam
vinculadas. O fluxo do exemplo:

```
Orçamentos  #12 "Proposta Edifício Aurora"
     │
     ├──► Compras  #45 "Cotação de esquadrias — Aurora"
     │         devolve os valores, e a conexão mantém o rastro
     │
     └──► Administrativo  #78 "Certidões para habilitação"
```

Na prática: abra o card, vá em **Conexões** e escolha o processo e a
atividade de destino. As duas passam a exibir uma à outra, com a fase atual
de cada uma — dá para acompanhar o encadeamento inteiro sem sair do card.

---

## 5. Automações

O motor funciona por **gatilho → condição → ação**.

Gatilhos: card criado · card movido · campo alterado · prazo próximo ·
prazo vencido · SLA da fase estourado · comentário adicionado

Ações: mover de fase · atribuir responsável · alterar campo · aplicar
etiqueta · enviar notificação

Exemplos aplicáveis à DECK:

| Quando | Então |
|---|---|
| Compra acima de R$ 10.000 entra em Aprovação | Atribuir à diretoria |
| Atividade marcada como Urgente | Etiqueta vermelha e aviso ao responsável |
| Prazo vence em 24h | Avisar responsável |
| Prazo vencido | Avisar responsável e gestor |
| Orçamento vai para "Ganho" | Abrir atividade no Financeiro |

⚠️ **Limitação atual:** a fila de automações é processada por agendamento.
No plano gratuito da Vercel isso roda **uma vez por dia**. Ver seção 9.

---

## 6. Dashboards

### Individual — "Início"
Tarefas abertas · Atrasadas · Meus cards · Cards atrasados · lista de
pendências ordenada por urgência.

### Gerencial — "Indicadores"
Total de atividades · pendentes · em andamento · atrasadas · concluídas ·
por funcionário · por setor · por prioridade · tempo médio de conclusão ·
produtividade por período · % concluídas no prazo · gargalos por fase
(mediana e percentil 85).

> Os indicadores usam **mediana e percentil 85**, não média: uma única
> atividade parada 40 dias distorce a média e esconde o comportamento real.

---

## 7. Telas

| Tela | Rota | Situação |
|---|---|---|
| Meu painel | `/dashboard` | ✓ |
| Pipeline do setor | `/pipes/{id}` | ✓ Kanban com arrastar e soltar |
| Visão em tabela | `/pipes/{id}/list` | ✓ ordenável e paginada |
| Minhas atividades | `/tasks` | ✓ |
| Relatórios | `/reports` | ✓ |
| Dashboard gerencial | `/dashboards` | ✓ |
| Administração de usuários | `/settings/members` | ✓ |
| Configurações | `/settings` | ✓ |
| Notificações | `/notifications` | ✓ sino na topbar + página |
| **Calendário de prazos** | — | ✗ não existe |

### Notificações

O sino da topbar mostra as não lidas e as oito mais recentes; a página
lista tudo, separando não lidas de anteriores.

Você é avisado quando:

| Evento | Quem recebe |
|---|---|
| Foi atribuído a uma atividade | Quem recebeu a atribuição |
| Comentário novo | Responsáveis e criador, menos quem comentou |
| Anexo novo | Responsáveis e criador, menos quem anexou |
| Prazo vence em menos de 24h | Responsáveis e criador |
| Prazo vencido | Responsáveis e criador, uma vez por dia |
| Atividade relacionada concluída | Participantes do card vinculado |
| Automação com aviso | Conforme a automação |

Ninguém é notificado da própria ação. Os avisos de prazo dependem do
processamento periódico — ver seção 9 sobre a frequência do agendamento.

---

## 8. Fluxo de uso diário

1. **Entrar** → cai no Meu painel, com o que está atrasado ou vence hoje
2. **Abrir o processo do setor** → quadro Kanban com as atividades por fase
3. **Criar atividade** → título, descrição, prioridade, responsável, prazo
4. **Trabalhar** → comentar, anexar, marcar checklist, editar campos
5. **Avançar** → arrastar para a próxima fase (campos obrigatórios são
   cobrados na passagem)
6. **Precisou de outro setor** → criar atividade vinculada
7. **Concluir** → arrastar para a fase final
8. **Gestor acompanha** → Indicadores, atrasos e gargalos

---

## 9. O que ainda não existe

Estas são lacunas reais, não detalhes de acabamento:

| Lacuna | Impacto | Esforço |
|---|---|---|
| **Calendário de prazos** | Não existe. Prazos só aparecem no card e nos filtros. | ~1,5 dia |
| **Anexos** | Só grava o nome do arquivo; o upload não está ligado ao armazenamento. Crítico para obra (fotos, notas fiscais). | ~2 dias |
| **E-mail** | Nenhum e-mail sai do sistema. | ~1 dia |
| **Automações 1×/dia** | No plano gratuito da Vercel o cron roda uma vez ao dia. Alternativa: `pg_cron` do Supabase, a cada 5 min. | ~0,5 dia |
| **Prazo da fase impreciso** | O relógio do SLA reinicia quando alguém edita o card. Compromete o indicador de gargalo. | ~2 dias |
| **Filtros no quadro** | O quadro não tem busca nem filtro; a tabela ordena mas não filtra. | ~2 dias |
| **Reabrir atividade** | Dá para mover de volta arrastando, mas não há ação explícita de "reabrir". | ~0,5 dia |

**Ordem sugerida:** anexos → prazo da fase → filtros → calendário.

⚠️ **Atenção ao agendamento.** Os avisos de prazo (vence em 24h, vencido)
dependem do processamento periódico. No plano gratuito da Vercel isso roda
**uma vez por dia**, de madrugada — ou seja, um prazo que vence às 10h só
gera aviso no dia seguinte. Configure o `pg_cron` do Supabase para rodar a
cada 5 minutos (passo 5 do `DEPLOY.md`); sem isso, metade do valor das
notificações se perde.

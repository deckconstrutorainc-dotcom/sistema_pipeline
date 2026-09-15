# Publicar o Koryn Task na Vercel

O deploy exige login na Vercel, que abre o navegador — por isso os passos
abaixo são seus. Leva cerca de 10 minutos.

O banco (Supabase) já está no ar, com as migrations e a estrutura da DECK
aplicadas. Só falta hospedar a aplicação.

---

## 1. Criar o projeto

1. Entre em [vercel.com/new](https://vercel.com/new) com a conta do GitHub
2. Escolha o repositório **deckconstrutorainc-dotcom/sistema_pipeline**
3. A Vercel detecta Next.js sozinha — **não mexa** em build command nem
   output directory
4. **Antes de clicar em Deploy**, abra *Environment Variables* e preencha
   o passo 2

## 2. Variáveis de ambiente

Copie exatamente do `.env.local` da sua máquina. As três primeiras são
obrigatórias:

| Nome | Onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oxqbtglqyfdrcfyytiwz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys → publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → secret |
| `ENCRYPTION_KEY` | já gerada no seu `.env.local` |
| `CRON_SECRET` | já gerado no seu `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | preencha depois do primeiro deploy, com a URL real |

> A chave **secret** (service role) ignora as regras de segurança do banco.
> Marque-a apenas para *Production* e *Preview*, nunca exponha em outro
> lugar. Ela nunca vai para o navegador.

Opcionais, só se for usar IA: `ANTHROPIC_API_KEY` e `GOOGLE_API_KEY`.

## 3. Publicar

Clique em **Deploy** e aguarde ~2 minutos. A URL sai no formato
`sistema-pipeline-xxxx.vercel.app`.

Volte em *Settings → Environment Variables*, preencha
`NEXT_PUBLIC_SITE_URL` com essa URL e clique em **Redeploy** — sem isso, o
link de recuperação de senha aponta para `localhost`.

## 4. Autorizar a URL no Supabase

Em **Authentication → URL Configuration**:

- **Site URL**: a URL da Vercel
- **Redirect URLs**: adicione `https://sua-url.vercel.app/**`

Sem isso, o login redireciona para o lugar errado depois de autenticar.

## 5. Automações a cada 5 minutos

O `vercel.json` agenda as automações para 03:00. **No plano gratuito, a
Vercel só permite uma execução por dia** — o que significa que uma automação
disparada às 9h só roda na madrugada seguinte.

Se isso for um problema (e para gestão de atividades costuma ser), use o
`pg_cron` do próprio Supabase. No **SQL Editor**:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'processar-automacoes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://SUA-URL.vercel.app/api/automations/process',
    headers := jsonb_build_object('x-cron-secret', 'SEU_CRON_SECRET')
  );
  $$
);
```

Troque `SUA-URL` e `SEU_CRON_SECRET` pelos valores reais. Para conferir o
agendamento: `select * from cron.job;`

## 6. Domínio próprio (opcional)

Em *Settings → Domains*, adicione algo como
`atividades.deckconstrutora.com.br` e siga as instruções de DNS. Depois,
atualize `NEXT_PUBLIC_SITE_URL` e as URLs do Supabase (passo 4).

---

## Depois de publicar

1. **Troque a senha do banco** em Supabase → Settings → Database → Reset
   database password. A atual foi compartilhada durante o desenvolvimento.
2. **Apague as contas de teste**: Ana Paula, Carlos, Juliana e Roberto, em
   Authentication → Users.
3. **Peça a cada funcionário que troque a senha** no primeiro acesso — todos
   entram com `Deck@2026`.
4. **Apague o processo de demonstração** "Compras e Suprimentos" (o de
   exemplo com cimento e tubos), diferente do processo "Compras" real.

## Se algo der errado

**Build falha na Vercel** — confira se as três variáveis obrigatórias estão
preenchidas. O build precisa delas.

**Entra mas nenhuma tela carrega** — quase sempre é o passo 4 (URLs não
autorizadas no Supabase).

**"Invalid API key"** — a chave foi copiada do projeto errado, ou faltou o
redeploy depois de alterá-la. Variáveis só valem a partir do próximo deploy.

# Como rodar o Koryn Task

Guia para subir o sistema pela primeira vez. Leva cerca de 10 minutos, a
maior parte esperando o projeto do Supabase ser criado.

## Antes de começar

- Node.js 20 ou superior (esta máquina tem a 24)
- Uma conta em [supabase.com](https://supabase.com) — o plano gratuito basta

Não é preciso Docker. O Docker só seria necessário para rodar o Supabase
local (`supabase start`); aqui usamos um projeto na nuvem.

---

## 1. Criar o projeto no Supabase

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard) e clique
   em **New project**.
2. Preencha:
   - **Name**: `koryn-task`
   - **Database Password**: gere uma senha forte e **guarde** — ela é usada
     no passo 3 e não é exibida de novo.
   - **Region**: `South America (São Paulo)` — menor latência no Brasil.
3. Clique em **Create new project** e aguarde (~2 minutos).

## 2. Copiar as credenciais

No projeto criado, vá em **Project Settings → API** e copie:

| Campo | Vai para |
|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon / public** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role** | `SUPABASE_SERVICE_ROLE_KEY` |

> A chave **service_role** ignora as políticas de segurança (RLS). Ela é
> usada apenas no servidor e nunca deve ir para o navegador nem ser
> compartilhada. O `.env.local` está no `.gitignore` e não é versionado.

## 3. Aplicar as migrations

No terminal, dentro da pasta do projeto:

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

O `<ref-do-projeto>` é o trecho da URL do painel:
`https://supabase.com/dashboard/project/ABCDEFGH` → `ABCDEFGH`.

O `db push` aplica as 67 migrations em ordem. Ao final, o banco tem 55
tabelas com RLS ativa.

Depois, aplique o seed (papéis e permissões do sistema) pelo **SQL Editor**
do painel, colando o conteúdo de `supabase/seed.sql`.

## 4. Configurar o ambiente local

```bash
cp .env.example .env.local
```

Abra `.env.local` e preencha as três variáveis do passo 2. As demais são
opcionais para um primeiro uso:

| Variável | Necessária? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | sim |
| `ENCRYPTION_KEY` | só para integrações e webhooks |
| `CRON_SECRET` | só para processar a fila de automações |
| `ANTHROPIC_API_KEY` | só para os recursos de IA |
| `GOOGLE_API_KEY` | só para criar card por voz |

Para gerar a `ENCRYPTION_KEY`, se for usar integrações:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 5. Subir o sistema

```bash
npm install   # se ainda não instalou
npm run dev
```

Acesse http://localhost:3000

## 6. Criar a primeira conta

1. Vá em **Entrar** → **Criar conta** e cadastre-se com e-mail e senha.
2. Confirme o e-mail. Em desenvolvimento, o link chega em
   **Authentication → Users** no painel do Supabase; ou desative a exigência
   em **Authentication → Providers → Email → Confirm email**.
3. No primeiro acesso o sistema pede para criar uma organização. Quem cria
   vira `super_admin` dela.
4. Crie um pipe, adicione fases e campos, e crie o primeiro card.

---

## Problemas comuns

**"Invalid API key" ao abrir o sistema**
As chaves do `.env.local` não batem com o projeto. Confira se copiou do
projeto certo e reinicie o `npm run dev` — variáveis de ambiente só são
lidas na inicialização.

**Login funciona mas nenhuma tela carrega dados**
As migrations não foram aplicadas, ou o seed não rodou. Confira em
**Table Editor** se as tabelas existem e se `roles` tem seis linhas.

**"permission denied for table ..."**
O seed não foi aplicado: sem os papéis e permissões, as políticas de RLS
negam tudo. Rode `supabase/seed.sql` no SQL Editor.

**Automações não executam**
É esperado. A fila de jobs é processada por `/api/automations/process`, que
exige `CRON_SECRET` e um agendador. Em desenvolvimento, chame a rota à mão:

```bash
curl -X POST http://localhost:3000/api/automations/process \
  -H "x-cron-secret: <seu CRON_SECRET>"
```

**Anexos não sobem**
Também esperado: a integração com o Supabase Storage ainda não foi feita.
Hoje só os metadados do anexo são gravados.

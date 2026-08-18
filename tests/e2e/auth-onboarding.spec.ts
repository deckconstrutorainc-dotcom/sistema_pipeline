import { expect, test } from "@playwright/test";

/**
 * PENDÊNCIA REAL: estes testes E2E exercitam telas que dependem de um
 * projeto Supabase real/local respondendo (login efetivo, criação de
 * organização). Sem `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * válidos configurados no ambiente que roda `npm run test:e2e`, o fluxo de
 * login real não pode ser validado ponta a ponta — por isso o teste abaixo
 * cobre apenas o que é validável sem backend: a página de login renderiza
 * o formulário esperado. O fluxo completo (login -> onboarding -> criar
 * organização -> dashboard) fica documentado aqui como próximo passo assim
 * que houver uma instância Supabase disponível em CI/local.
 */

test("a página de login renderiza o formulário de autenticação", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("a página de cadastro renderiza o formulário de criação de conta", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
});

test.skip(
  "fluxo completo login -> onboarding -> criar organização -> dashboard",
  async () => {
    // Requer usuário de teste real em um projeto Supabase (local ou
    // dedicado a CI) e credenciais via variáveis de ambiente. Ver
    // tests/integration/rls-tenant-isolation.test.ts para o mesmo
    // pré-requisito de infraestrutura.
  },
);

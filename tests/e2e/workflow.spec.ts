import { expect, test } from "@playwright/test";

/**
 * E2E do Workflow Core (M2): criar pipe, criar card, mover card, impedir
 * movimento por campo obrigatório, preencher requisito, mover card,
 * consultar histórico.
 *
 * PENDÊNCIA REAL: mesmo padrão de `tests/e2e/auth-onboarding.spec.ts` (M1) —
 * este fluxo depende de login efetivo contra um projeto Supabase real/local
 * (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` válidos), que
 * não está disponível neste ambiente de execução. Os testes ficam
 * documentados como `test.skip` até que exista uma instância Supabase
 * (local via `supabase start` ou dedicada a CI) com usuário de teste
 * provisionado.
 */

test.skip("admin cria um pipe com fases e campos", async () => {
  // 1. login como admin de uma organização de teste
  // 2. navegar até /pipes
  // 3. criar pipe "Contratos"
  // 4. criar fases "Aberto" (inicial) e "Concluído" (final)
  // 5. criar campo obrigatório "Valor do contrato" na fase "Aberto"
});

test.skip("usuário cria um card e ele aparece na fase inicial do kanban", async () => {
  // 1. em /pipes/[pipeId], usar o formulário "Adicionar card"
  // 2. verificar que o card aparece na coluna da fase inicial com o número
  //    sequencial esperado (#1)
});

test.skip("mover card via drag-and-drop é bloqueado quando falta campo obrigatório", async () => {
  // 1. arrastar o card da fase "Aberto" para "Concluído" sem preencher
  //    "Valor do contrato"
  // 2. esperar mensagem de erro visível e o card voltar (rollback visual)
  //    para a coluna original
});

test.skip("preencher o campo obrigatório permite mover o card com sucesso", async () => {
  // 1. abrir o card (URL compartilhável /pipes/[pipeId]/cards/[cardId])
  // 2. preencher "Valor do contrato"
  // 3. mover o card para "Concluído" via seletor de fase na página do card
  // 4. verificar que a fase foi atualizada
});

test.skip("histórico do card registra a movimentação de fase", async () => {
  // 1. na página do card, verificar que a seção "Histórico" lista uma
  //    entrada "Fase alterada" após a movimentação do teste anterior
});

test.skip("card_id garante URL compartilhável e acessível diretamente", async ({ page }) => {
  // 1. navegar diretamente para /pipes/[pipeId]/cards/[cardId] (sem passar
  //    pelo kanban) e confirmar que a página carrega o card correto
  await page.goto("/pipes/00000000-0000-0000-0000-000000000000/cards/00000000-0000-0000-0000-000000000000");
  expect(page).toBeDefined();
});

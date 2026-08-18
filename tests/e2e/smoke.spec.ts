import { expect, test } from "@playwright/test";

test("a página inicial carrega e mostra o título BTS Pipe", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BTS Pipe" })).toBeVisible();
});

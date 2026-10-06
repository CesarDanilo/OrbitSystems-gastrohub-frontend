import { expect, test } from '@playwright/test';

test('Free plan hits a limit, upgrades to Pro and the feature is released', async ({ page }) => {
  const email = `free-${Date.now()}@e2e.dev`;
  await page.goto('/cadastro');
  await page.getByLabel('Nome do restaurante').fill('Lanchonete E2E');
  await page.getByLabel('Seu nome').fill('Dona E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123');
  await page.getByRole('button', { name: 'Criar minha loja' }).click();
  await expect(page).toHaveURL(/\/admin/);

  // Reach the Free limit of 5 categories through the API (same session cookie).
  for (let i = 1; i <= 5; i++) {
    const res = await page.request.post('/api/admin/categories', {
      data: { name: `Categoria ${i}` },
      headers: { 'x-requested-with': 'hamb' },
    });
    expect(res.status()).toBe(201);
  }

  await page.goto('/admin/cardapio');
  await page.getByRole('tab', { name: 'Categorias' }).click();
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Sobremesas');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Seu plano Free permite até 5 categorias.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

  // Pro-only feature is locked, with an explanation.
  await page.goto('/admin/configuracoes');
  await page.getByRole('tab', { name: 'WhatsApp e IA' }).click();
  await expect(page.getByText('WhatsApp automatizado está no plano Pro')).toBeVisible();

  // Upgrade.
  await page.goto('/admin/plano');
  await page.getByRole('button', { name: 'Assinar Pro' }).click();
  await expect(page.getByText('Plano atualizado')).toBeVisible();

  // Limit released.
  await page.goto('/admin/cardapio');
  await page.getByRole('tab', { name: 'Categorias' }).click();
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Sobremesas');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Categoria criada')).toBeVisible();

  // Feature released.
  await page.goto('/admin/configuracoes');
  await page.getByRole('tab', { name: 'WhatsApp e IA' }).click();
  await expect(page.getByRole('switch', { name: 'Ativar WhatsApp' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { BELLA, login } from './helpers';

test('a new restaurant starts with a free trial of the recommended plan', async ({ page }) => {
  const email = `trial-${Date.now()}@e2e.dev`;
  await page.goto('/cadastro');
  await page.getByLabel('Nome do restaurante').fill('Lanchonete E2E');
  await page.getByLabel('Seu nome').fill('Dona E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123');
  await page.getByRole('button', { name: 'Criar minha loja' }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto('/admin/plano');
  await expect(page.getByRole('heading', { name: 'Plano Profissional' })).toBeVisible();
  await expect(page.getByText('Em teste', { exact: true })).toBeVisible();

  await page.goto('/admin/configuracoes');
  await page.getByRole('tab', { name: 'WhatsApp e IA' }).click();
  await expect(page.getByRole('switch', { name: 'Ativar WhatsApp' })).toBeVisible();
});

test('free plan hits a limit on the server, upgrade releases it', async ({ page }) => {
  await login(page, BELLA);
  const existing = (await (await page.request.get('/api/admin/categories')).json()) as unknown[];
  for (let i = existing.length + 1; i <= 5; i++) {
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
  await expect(page.getByText('Seu plano Gratuito permite até 5 categorias.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

  await page.goto('/admin/plano');
  await page.getByRole('button', { name: 'Mudar para Profissional' }).click();
  await expect(page.getByText('Plano atualizado')).toBeVisible();

  await page.goto('/admin/cardapio');
  await page.getByRole('tab', { name: 'Categorias' }).click();
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Sobremesas');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Categoria criada')).toBeVisible();
});

test('pricing page highlights the recommended plan and computes real yearly savings', async ({
  page,
}) => {
  await page.goto('/planos');
  const cards = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(cards).toHaveCount(3);
  await expect(page.getByText('Mais recomendado')).toBeVisible();
  await page.getByRole('radio', { name: 'Anual' }).click();
  // Profissional: 12 × R$ 179,00 − R$ 1.790,00 = R$ 358,00
  await expect(page.getByText('economia de R$ 358,00 no ano')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

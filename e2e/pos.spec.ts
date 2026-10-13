import { expect, test } from '@playwright/test';
import { BRASA, login } from './helpers';

test('counter sale: open the register, sell, charge with change, kitchen sees it', async ({
  page,
}) => {
  await login(page, BRASA);

  await page.goto('/admin/caixa');
  await page.getByRole('button', { name: 'Abrir caixa' }).first().click();
  await page.getByLabel('Valor inicial (troco)').fill('100,00');
  await page.getByRole('dialog').getByRole('button', { name: 'Abrir caixa' }).click();
  await expect(page.getByText('Caixa aberto', { exact: true })).toBeVisible();

  await page.goto('/admin/pdv');
  await page.getByRole('button', { name: /Batata Rústica/ }).click();
  await page.getByLabel('Nome do cliente').fill('Balcão E2E');
  await page.getByRole('button', { name: 'Lançar e cobrar' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Cobrar pedido #\d+/)).toBeVisible();
  await dialog.getByText('Dinheiro', { exact: true }).click();
  await dialog.getByLabel('Valor entregue pelo cliente').fill('20,00');
  await expect(dialog.getByText('Troco: R$ 5,10')).toBeVisible();
  await dialog.getByRole('button', { name: /Registrar/ }).click();
  await expect(page.getByText('Troco: R$ 5,10')).toBeVisible();
  await dialog.getByRole('button', { name: 'Concluir' }).click();

  await page.goto('/admin/cozinha');
  await expect(page.getByText('Balcão E2E').first()).toBeVisible();

  await page.goto('/admin/caixa');
  await expect(page.getByText('R$ 114,90')).toBeVisible();
});

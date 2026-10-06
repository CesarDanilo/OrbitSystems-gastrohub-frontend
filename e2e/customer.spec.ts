import { expect, test } from '@playwright/test';

/** Customer journey on a phone: store → product → options → cart → checkout → tracking. */
test('customer orders a burger with options and follows the order', async ({ page }) => {
  await page.goto('/s/brasa');
  await expect(page.getByRole('heading', { name: 'Hamburgueria Brasa', level: 1 })).toBeVisible();
  await expect(page.getByText('Aberto agora')).toBeVisible();

  await page
    .getByRole('link', { name: /X-Salada/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'X-Salada' });
  await expect(sheet).toBeVisible();

  // Required group is enforced before adding.
  await sheet.getByRole('button', { name: /Adicionar/ }).click();
  await expect(sheet.getByText('Escolha uma opção.')).toBeVisible();

  await sheet.getByText('Brioche').click();
  await sheet.getByText('Cheddar').click();
  await expect(sheet.getByRole('button', { name: /Adicionar · R\$\s?34,90/ })).toBeVisible();
  await sheet.getByRole('button', { name: /Adicionar/ }).click();

  await page.getByRole('link', { name: /Ver carrinho/ }).click();
  await expect(page.getByText('Brioche, Cheddar')).toBeVisible();
  await page.getByRole('button', { name: 'Aumentar quantidade de X-Salada' }).click();
  await expect(page.getByText('R$ 69,80').first()).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Nome').fill('Maria E2E');
  await page.getByLabel('WhatsApp').fill('11999990000');
  await page.getByRole('radio', { name: /Retirada/ }).click();
  await page.getByText('Dinheiro', { exact: true }).click();
  await page.getByRole('button', { name: /Fazer pedido/ }).click();

  await expect(page).toHaveURL(/\/s\/brasa\/pedido\//);
  await expect(page.getByRole('heading', { name: /Pedido #\d+/ })).toBeVisible();
  await expect(page.getByText('Aguardando confirmação').first()).toBeVisible();
  await expect(page.getByText('2× X-Salada')).toBeVisible();
});

test('checkout shows field errors and keeps the cart', async ({ page }) => {
  await page.goto('/s/brasa/p/batata-rustica');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Adicionar/ })
    .click();
  await page.goto('/s/brasa/checkout');
  await page.getByRole('button', { name: /Fazer pedido/ }).click();
  await expect(page.getByText('Revise os campos destacados')).toBeVisible();
  await expect(page.getByText('Informe seu nome.').first()).toBeVisible();

  await page.reload();
  await page.goto('/s/brasa/carrinho');
  await expect(page.getByText('Batata Rústica')).toBeVisible();
});

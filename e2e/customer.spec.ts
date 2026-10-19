import { expect, test } from '@playwright/test';
import { placeOrder } from './helpers';

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

test('a lost response does not duplicate the order when the customer taps again', async ({
  page,
  request,
}) => {
  await page.goto('/s/brasa/p/batata-rustica');
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await sheet.getByRole('button', { name: /Adicionar/ }).click();
  await page.goto('/s/brasa/checkout');
  await page.getByLabel('Nome').fill('Rede Instável');
  await page.getByLabel('WhatsApp').fill('11977776666');
  await page.getByRole('radio', { name: /Retirada/ }).click();
  await page.getByText('Dinheiro', { exact: true }).click();

  // First attempt reaches the server (the order is created) but the answer never arrives.
  const keys: string[] = [];
  await page.route('**/api/public/stores/brasa/orders', async (route) => {
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (keys.length === 1) {
      await route.fetch();
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  await page.getByRole('button', { name: /Fazer pedido/ }).click();
  await expect(page.getByText('Sem conexão').first()).toBeVisible();

  await page.getByRole('button', { name: /Fazer pedido/ }).click();
  await expect(page).toHaveURL(/\/s\/brasa\/pedido\//);
  const heading = await page.getByRole('heading', { name: /Pedido #\d+/ }).textContent();
  const number = Number(heading!.match(/#(\d+)/)![1]);

  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f]{32}$/);
  expect(keys[1]).toBe(keys[0]);
  // Only one order was created: the next one takes the following number.
  const next = await placeOrder(request, 'brasa', 'Próximo Cliente');
  expect(next.number).toBe(number + 1);
});

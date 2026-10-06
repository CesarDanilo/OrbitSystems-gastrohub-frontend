import { expect, test } from '@playwright/test';
import { BELLA, BRASA, login, placeOrder } from './helpers';

test('restaurant moves an order forward and the customer sees it', async ({
  page,
  request,
  browser,
}) => {
  const order = await placeOrder(request, BRASA.slug, 'Cliente E2E');

  await login(page, BRASA);
  await page
    .getByRole('navigation', { name: 'Painel' })
    .getByRole('link', { name: /Pedidos/ })
    .click();
  const card = page.locator('li', { hasText: `#${order.number}` });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(`Pedido #${order.number} atualizado`)).toBeVisible();

  const customer = await browser.newPage();
  await customer.goto(`/s/${BRASA.slug}/pedido/${order.publicToken}`);
  await expect(customer.getByRole('listitem').filter({ hasText: 'Confirmado' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await customer.close();
});

test('dashboard answers what is happening now', async ({ page }) => {
  await login(page, BRASA);
  await expect(page.getByText('Pedidos em andamento')).toBeVisible();
  await expect(page.getByText('Faturamento')).toBeVisible();
  await expect(page.getByText('O que você pode fazer')).toBeVisible();
});

test('a restaurant cannot read another restaurant data', async ({ page }) => {
  await login(page, BRASA);
  const brasaProducts = await (await page.request.get('/api/admin/products')).json();
  const brasaProductId = brasaProducts[0].id;

  await page.context().clearCookies();
  await login(page, BELLA);
  const own = await (await page.request.get('/api/admin/products')).json();
  expect(
    own.every((p: { restaurantId: string }) => p.restaurantId !== brasaProducts[0].restaurantId),
  ).toBe(true);

  const stolen = await page.request.get(`/api/admin/products/${brasaProductId}`);
  expect(stolen.status()).toBe(404);
  const update = await page.request.patch(`/api/admin/products/${brasaProductId}/active`, {
    data: { active: false },
    headers: { 'x-requested-with': 'hamb' },
  });
  expect(update.status()).toBe(404);

  await page.goto('/admin/cardapio');
  await expect(page.getByText('Margherita')).toBeVisible();
  await expect(page.getByText('X-Bacon')).toHaveCount(0);
});

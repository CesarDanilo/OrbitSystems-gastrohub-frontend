import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Seeded demo accounts (see apps/api/prisma/seed.ts). Test values for local/CI only. */
export const BRASA = { email: 'dono@brasa.dev', password: 'demo12345', slug: 'brasa' };
export const BELLA = { email: 'dono@bella.dev', password: 'demo12345', slug: 'bella' };

export async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

/** Places an order straight through the public API, as a customer's phone would. */
export async function placeOrder(request: APIRequestContext, slug: string, customerName: string) {
  const store = await (await request.get(`/api/public/stores/${slug}`)).json();
  const product = store.categories
    .flatMap(
      (c: { products: { id: string; name: string; optionGroups: unknown[] }[] }) => c.products,
    )
    .find((p: { optionGroups: unknown[] }) => p.optionGroups.length === 0);
  const response = await request.post(`/api/public/stores/${slug}/orders`, {
    data: {
      customer: { name: customerName, phone: '11988887777' },
      fulfillment: 'PICKUP',
      payment: { method: 'CASH' },
      items: [{ productId: product.id, quantity: 2, optionIds: [] }],
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { publicToken: string; number: number };
}

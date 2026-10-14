import { expect, test } from '@playwright/test';

test('a user changes the password and the old one stops working', async ({ page, browser }) => {
  const email = `seguranca-${Date.now()}@e2e.dev`;
  const signup = await page.request.post('/api/auth/signup', {
    data: {
      name: 'Teste Senha',
      email,
      password: 'senha-antiga-123',
      restaurantName: 'Loja Senha',
    },
  });
  expect(signup.status()).toBe(201);

  // A second device logged in with the same account.
  const other = await browser.newContext();
  const otherLogin = await other.request.post('/api/auth/login', {
    data: { email, password: 'senha-antiga-123' },
  });
  expect(otherLogin.status()).toBe(200);

  await page.goto('/admin/pedidos');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  const dialog = page.getByRole('dialog', { name: 'Alterar senha' });
  await dialog.getByLabel('Senha atual').fill('senha-antiga-123');
  await dialog.getByLabel('Nova senha', { exact: true }).fill('senha-nova-456');
  await dialog.getByLabel('Confirme a nova senha').fill('senha-nova-456');
  await dialog.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByText('Senha alterada.')).toBeVisible();

  // This device stays signed in; the other one was disconnected.
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect((await other.request.get('/api/auth/me')).status()).toBe(401);
  await other.close();

  const old = await page.request.post('/api/auth/login', {
    data: { email, password: 'senha-antiga-123' },
    headers: { 'x-requested-with': 'hamb' },
  });
  expect(old.status()).toBe(401);
});

test('pages are served with the security headers of the API layer', async ({ request }) => {
  const res = await request.get('/api/auth/me');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-powered-by']).toBeUndefined();
});

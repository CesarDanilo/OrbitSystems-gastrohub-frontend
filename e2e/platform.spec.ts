import { expect, test } from '@playwright/test';
import { totpCode } from '../../api/src/shared/totp';
import { BRASA, PLATFORM, login } from './helpers';

test('restaurant users are blocked from the platform area', async ({ page }) => {
  await login(page, BRASA);
  expect((await page.request.get('/api/platform/dashboard')).status()).toBe(401);
  await page.goto('/platform-admin');
  await expect(page.getByRole('heading', { name: 'Administração da plataforma' })).toBeVisible();
});

test('owner logs in with MFA, edits a plan price and the public catalog follows after publishing', async ({
  page,
}) => {
  await page.goto('/platform-admin');
  await page.getByLabel('E-mail').fill(PLATFORM.email);
  await page.getByLabel('Senha').fill(PLATFORM.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('button', { name: 'Configurar agora' }).click();
  const secret = (await page.locator('code').textContent())!.trim();
  await page.getByLabel('Código').fill(totpCode(secret, Date.now()));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral da plataforma' })).toBeVisible();
  await expect(page.getByText('MRR contratado')).toBeVisible();

  await page.getByRole('link', { name: 'Planos' }).click();
  const card = page
    .locator('div', { has: page.getByText('ESSENCIAL', { exact: true }) })
    .filter({
      has: page.getByRole('button', { name: 'Preços, funcionalidades e limites' }),
    })
    .last();
  await card.getByRole('button', { name: 'Preços, funcionalidades e limites' }).click();
  await page.getByLabel('Preço mensal (R$)').fill('99,00');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByText('Rascunho salvo. Publique para valer.')).toBeVisible();

  // Draft is not public yet.
  const before = await (await page.request.get('/api/public/plans')).json();
  expect(before.find((p: { code: string }) => p.code === 'ESSENCIAL').priceCents).toBe(8900);

  await card.getByRole('button', { name: /Publicar v2/ }).click();
  await page.getByRole('dialog').getByLabel('Motivo').fill('reajuste de lançamento');
  await page.getByRole('dialog').getByRole('button', { name: 'Publicar versão' }).click();
  await expect(page.getByText('Alteração registrada')).toBeVisible();

  const after = await (await page.request.get('/api/public/plans')).json();
  expect(after.find((p: { code: string }) => p.code === 'ESSENCIAL').priceCents).toBe(9900);

  await page.getByRole('link', { name: 'Auditoria' }).click();
  await expect(page.getByText('plan.published').first()).toBeVisible();
});

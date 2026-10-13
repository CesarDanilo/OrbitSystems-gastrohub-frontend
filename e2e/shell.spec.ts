import { expect, test } from '@playwright/test';
import { BRASA, login } from './helpers';

test('dark is the default theme, light is remembered after reload', async ({ page }) => {
  await login(page, BRASA);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Usar tema claro' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('sidebar collapses to icons with tooltips and stays collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, BRASA);
  const sidebar = page.getByRole('complementary', { name: 'Menu do painel' });
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeLessThan(80);

  // Icons keep their names for assistive tech and show a tooltip on hover.
  const orders = sidebar.getByRole('link', { name: /^Pedidos/ });
  await expect(orders).toBeVisible();
  await orders.hover();
  await expect(page.getByText('Pedidos', { exact: true })).toBeVisible();

  await page.reload();
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  await page.getByRole('button', { name: 'Expandir menu' }).click();
  await expect(sidebar).toHaveAttribute('data-state', 'expanded');
});

test('on a phone the menu is a drawer that closes on Escape and on navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await login(page, BRASA);
  await expect(page.getByRole('complementary', { name: 'Menu do painel' })).toBeHidden();

  const menu = page.getByRole('button', { name: 'Abrir menu' });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'Menu do painel' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await drawer.getByRole('link', { name: /^Cardápio/ }).click();
  await expect(page).toHaveURL(/\/admin\/cardapio/);
  await expect(drawer).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

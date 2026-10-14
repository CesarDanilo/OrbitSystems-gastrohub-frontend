import { expect, test } from '@playwright/test';
import { BRASA, login } from './helpers';

test('imports products from a CSV exported by another system', async ({ page }) => {
  await login(page, BRASA);
  await page.goto('/admin/configuracoes');
  await page.getByRole('tab', { name: 'Importar produtos' }).click();

  const csv = [
    'Produto;Categoria;Preço;Descrição',
    'Burger Importado;Importados;R$ 29,90;Veio do sistema antigo',
    'Suco Importado;Importados;9,50;',
    ';Importados;5,00;sem nome',
  ].join('\n');
  await page.getByLabel('Arquivo de produtos (CSV ou XML)').setInputFiles({
    name: 'cardapio-antigo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });

  const preview = page.getByRole('list', { name: 'Prévia da importação' });
  await expect(preview).toContainText('Burger Importado');
  await expect(preview).toContainText('Nome ausente');
  await page.getByRole('button', { name: 'Importar 2 produtos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Importação concluída' })).toContainText(
    '2 criados',
  );

  await page.goto('/admin/cardapio');
  await expect(page.getByText('Burger Importado')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Importados' })).toBeVisible();
});

test('best sellers open the product they refer to', async ({ page }) => {
  await login(page, BRASA);
  await page.getByRole('tab', { name: '30 dias' }).click();
  const first = page.getByRole('link', { name: /^1º / });
  await expect(first).toBeVisible();
  const name = (await first.getAttribute('aria-label'))!.replace(/^1º (.+?):.*$/, '$1');
  await first.click();
  await expect(page).toHaveURL(/\/admin\/cardapio\/[^/]+$/);
  await expect(page.getByLabel('Nome')).toHaveValue(name);
});

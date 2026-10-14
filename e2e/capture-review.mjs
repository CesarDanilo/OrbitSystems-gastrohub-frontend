// Captures review screenshots of the running dev server (http://localhost:5180) for the design
// finish review. Local tool, not part of the test suite. Uses the seeded demo account.
// Usage: node e2e/capture-review.mjs  (from apps/web, with the dev servers running)
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.REVIEW_BASE_URL ?? 'http://localhost:5180';
const OUT = '../../.impeccable/review';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
async function session(viewport, theme) {
  const context = await browser.newContext({ viewport, locale: 'pt-BR' });
  await context.addInitScript((t) => localStorage.setItem('gastrohub-theme', t), theme);
  const page = await context.newPage();
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel('E-mail').fill('dono@brasa.dev');
  await page.getByLabel('Senha', { exact: true }).fill('demo12345');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/admin/);
  return { context, page };
}

async function shot(page, path, file) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
}

{
  const { context, page } = await session({ width: 1440, height: 900 }, 'dark');
  await shot(page, '/admin/pdv', 'desktop.png');
  await shot(page, '/admin', 'desktop-inicio.png');
  await context.close();
}
{
  const { context, page } = await session({ width: 1440, height: 900 }, 'light');
  await shot(page, '/admin/pdv', 'desktop-light.png');
  await context.close();
}
{
  const { context, page } = await session({ width: 390, height: 844 }, 'dark');
  await shot(page, '/admin/pdv', 'mobile.png');
  await shot(page, '/admin/pedidos', 'mobile-pedidos.png');
  await context.close();
}
await browser.close();
console.warn('captures written to .impeccable/review');

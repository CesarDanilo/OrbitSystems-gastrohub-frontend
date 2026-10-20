import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

/**
 * E2E runs a dedicated API (port 3341) and web (port 5181) against the test database,
 * so it never touches development data. `e2e/global-setup.ts` migrates and seeds it.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // CI provides variables directly
}

const API_PORT = 3341;
const WEB_PORT = 5181;
/** Backend checkout used by E2E; override when the repositories are separate. */
const API_DIR = process.env.E2E_API_DIR ?? '../gastrohub-backend';
const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
/** Set by the QA coordinator: folder for the JSON report. */
const QA_RUN_DIR = process.env.QA_RUN_DIR;

const reporter: ReporterDescription[] = process.env.CI
  ? [['github'], ['html', { open: 'never' }]]
  : [['list']];
// `pnpm qa --agents=functional` reads individual results from this file.
if (QA_RUN_DIR) reporter.push(['json', { outputFile: `${QA_RUN_DIR}/playwright.json` }]);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /customer\.spec/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /customer\.spec/ },
  ],
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: API_DIR,
      url: `http://127.0.0.1:${API_PORT}/health/ready`,
      reuseExistingServer: false,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        LOG_LEVEL: 'warn',
        UPLOAD_DIR: 'node_modules/.cache/gastrohub-e2e-uploads',
      } as Record<string, string>,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { ...process.env, API_URL: `http://127.0.0.1:${API_PORT}` } as Record<string, string>,
    },
  ],
});

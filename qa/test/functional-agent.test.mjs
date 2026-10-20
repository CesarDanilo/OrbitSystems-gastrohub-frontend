import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { AGENTS, DEFAULT_AGENTS } from '../agents/index.mjs';
import {
  buildChildEnv,
  classifyFailure,
  copyEvidence,
  FORCED_ENV,
  parsePlaywrightReport,
  parseVitestReport,
  run,
} from '../agents/functional.mjs';
import {
  acquireLock,
  describeTarget,
  lockPath,
  parseTestDatabaseUrl,
  resolveTestDatabase,
} from '../coordinator/db-guard.mjs';
import { parseArgs, runQa } from '../coordinator/run.mjs';
import { validate } from '../coordinator/schema-check.mjs';

const schema = JSON.parse(
  await readFile(new URL('../schema/qa-run.schema.json', import.meta.url), 'utf8'),
);

const PASSWORD = 's3cr3t-pw-QA';
const URL_OK = `postgresql://gastrohub:${PASSWORD}@localhost:5442/gastrohub_test`;
const TARGET = { host: 'localhost', port: 5442, database: 'gastrohub_test' };

const tempDirs = [];
after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});
async function tempDir(prefix = 'gastrohub-qa-functional-') {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function put(file, content = '') {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** Text that satisfies the provider rules the agent checks in the real backend. */
const BACKEND_ENV_TS = `PAYMENT_PROVIDER: z.enum(['fake']).default('fake'),
  BILLING_PROVIDER: z.enum(['none', 'fake', 'asaas']).default('none'),`;
const BACKEND_CONTAINER_TS = `const payments = overrides.payments ?? new FakePaymentProvider(env.PAYMENT_WEBHOOK_SECRET);
(env.WHATSAPP_PROVIDER === 'cloud' && env.WHATSAPP_ACCESS_TOKEN ? new WhatsAppCloudProvider(env.WHATSAPP_ACCESS_TOKEN) : x)
env.ANTHROPIC_API_KEY ? new ClaudeInterpreter(env.ANTHROPIC_API_KEY) : y
env.BILLING_PROVIDER === 'asaas' ? new AsaasBillingProvider(env.ASAAS_API_KEY) : env.BILLING_PROVIDER === 'fake' ? z : null`;
const PLAYWRIGHT_CONFIG = `const API_PORT = 3341;
const WEB_PORT = 5181;
const QA_RUN_DIR = process.env.QA_RUN_DIR;`;

/** A frontend and a backend checkout with everything the prechecks look for. */
async function fixture({ backend = true, backendDeps = true, frontendDeps = true } = {}) {
  const base = await tempDir();
  const root = path.join(base, 'gastrohub-frontend');
  const backendDir = path.join(base, 'gastrohub-backend');
  await put(
    path.join(root, 'package.json'),
    JSON.stringify({
      packageManager: 'pnpm@12.9.1',
      scripts: { 'test:e2e': 'playwright test', test: 'vitest run' },
    }),
  );
  await put(path.join(root, 'playwright.config.ts'), PLAYWRIGHT_CONFIG);
  await put(path.join(root, 'e2e', 'customer.spec.ts'), "test('pede', async () => {});");
  await put(path.join(root, 'e2e', 'platform.spec.ts'), "import { totp } from './totp';");
  if (frontendDeps) {
    await put(path.join(root, 'node_modules', '@playwright', 'test', 'package.json'), '{}');
    await put(path.join(root, 'node_modules', 'vite', 'package.json'), '{}');
  }
  const chromium = path.join(base, 'chromium', 'chrome');
  await put(chromium, '');
  if (backend) {
    await put(
      path.join(backendDir, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@12.9.1', scripts: { test: 'vitest run' } }),
    );
    for (const file of [
      'src/server.ts',
      'test/global-setup.ts',
      'e2e-reset.ts',
      'scripts/create-platform-admin.ts',
    ]) {
      await put(path.join(backendDir, file));
    }
    await put(path.join(backendDir, 'prisma', 'seed.ts'), 'await db.user.create({});');
    await put(path.join(backendDir, 'src', 'config', 'env.ts'), BACKEND_ENV_TS);
    await put(path.join(backendDir, 'src', 'container.ts'), BACKEND_CONTAINER_TS);
    if (backendDeps) {
      for (const dep of ['vitest', 'prisma', 'tsx']) {
        await put(path.join(backendDir, 'node_modules', dep, 'package.json'), '{}');
      }
    }
  }
  const runDir = path.join(base, 'results', 'qa-run');
  await mkdir(runDir, { recursive: true });
  return {
    base,
    root,
    backendDir,
    chromium,
    runDir,
    lockDir: await tempDir('gastrohub-qa-lock-'),
    tmp: await tempDir('gastrohub-qa-tmp-'),
  };
}

const VITEST_REPORT = (backendDir) => ({
  numTotalTests: 3,
  success: false,
  testResults: [
    {
      name: path.join(backendDir, 'test', 'orders.test.ts'),
      status: 'failed',
      message: '',
      assertionResults: [
        {
          ancestorTitles: ['orders'],
          fullName: 'orders cria pedido',
          title: 'cria pedido',
          status: 'passed',
          duration: 12.4,
          failureMessages: [],
        },
        {
          ancestorTitles: ['orders'],
          fullName: 'orders recusa sem itens',
          title: 'recusa sem itens',
          status: 'failed',
          duration: 8,
          failureMessages: [
            `AssertionError: expected 201 to be 400 // Object.is equality\n    at test/orders.test.ts:40:5 (${URL_OK})`,
          ],
        },
        {
          ancestorTitles: ['orders'],
          fullName: 'orders pendente',
          title: 'pendente',
          status: 'skipped',
          failureMessages: [],
        },
      ],
    },
  ],
});

const PLAYWRIGHT_REPORT = (root) => ({
  config: { rootDir: path.join(root, 'e2e') },
  suites: [
    {
      title: 'customer.spec.ts',
      file: 'customer.spec.ts',
      specs: [],
      suites: [
        {
          title: 'Cliente',
          file: 'customer.spec.ts',
          specs: [
            {
              title: 'faz um pedido',
              file: 'customer.spec.ts',
              tests: [
                {
                  projectName: 'mobile',
                  status: 'unexpected',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      duration: 1500,
                      error: {
                        message:
                          'Error: expect(locator).toHaveText(expected) failed\nExpected: "Pago"',
                        stack: 'at e2e/customer.spec.ts:10:3',
                      },
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: path.join(
                            root,
                            'test-results',
                            'customer-Cliente-faz-um-pedido-mobile',
                            'test-failed-1.png',
                          ),
                        },
                        {
                          name: 'trace',
                          contentType: 'application/zip',
                          path: path.join(
                            root,
                            'test-results',
                            'customer-Cliente-faz-um-pedido-mobile',
                            'trace.zip',
                          ),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              title: 'abre o cardápio',
              file: 'customer.spec.ts',
              tests: [
                {
                  projectName: 'mobile',
                  status: 'flaky',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      duration: 900,
                      error: { message: 'Timeout 5000ms exceeded.' },
                      attachments: [],
                    },
                    { retry: 1, status: 'passed', duration: 700, attachments: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  errors: [],
});

/** Fake test processes: they write reporter files and record how they were started. */
function fakeRunner({ backend = { exitCode: 0 }, e2e = { exitCode: 0 }, fx, calls = [] }) {
  return async (script, definition) => {
    const call = {
      script,
      cwd: definition.cwd,
      env: definition.env,
      args: definition.args,
      startedAt: Date.now(),
    };
    calls.push(call);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const spec = script === 'test' ? backend : e2e;
    if (spec.throws) throw new Error(`falhou com ${URL_OK}`);
    if (script === 'test') {
      const target = definition.args.find((a) => a.startsWith('--outputFile.json='))?.split('=')[1];
      if (spec.report !== null && target) {
        await writeFile(target, spec.report ?? JSON.stringify(VITEST_REPORT(fx.backendDir)));
      }
    } else {
      const results = path.join(fx.root, 'test-results', 'customer-Cliente-faz-um-pedido-mobile');
      await put(path.join(results, 'test-failed-1.png'), 'PNG');
      await put(path.join(results, 'trace.zip'), 'ZIP');
      if (spec.report !== null) {
        await writeFile(
          path.join(definition.env.QA_RUN_DIR, 'playwright.json'),
          spec.report ?? JSON.stringify(PLAYWRIGHT_REPORT(fx.root)),
        );
      }
    }
    call.finishedAt = Date.now();
    return {
      exitCode: spec.exitCode,
      output: spec.output ?? `saída ${script}\nDATABASE_URL=${URL_OK}\nASAAS_API_KEY=chave-real\n`,
      durationMs: 5,
    };
  };
}

function parentEnv(extra = {}) {
  return {
    PATH: process.env.PATH ?? '',
    TEST_DATABASE_URL: URL_OK,
    DATABASE_URL: 'postgresql://prod:prod-pw@db.example.com:5432/gastrohub',
    ASAAS_API_KEY: 'asaas-real',
    ASAAS_WEBHOOK_TOKEN: 'asaas-webhook',
    WHATSAPP_ACCESS_TOKEN: 'wa-real',
    METRICS_TOKEN: 'metrics-real',
    ANTHROPIC_API_KEY: 'sk-ant-real-key-0123456789',
    BILLING_PROVIDER: 'asaas',
    WHATSAPP_PROVIDER: 'cloud',
    node_env: 'production',
    ...extra,
  };
}

function context(fx, overrides = {}) {
  return {
    runId: `qa-test-${Math.random().toString(16).slice(2, 8)}`,
    runDir: fx.runDir,
    root: fx.root,
    backendDir: fx.backendDir,
    environment: {},
    env: parentEnv(),
    probeTcp: async (host, port) => port === 5442,
    chromiumPath: async () => fx.chromium,
    lockDir: fx.lockDir,
    isProcessAlive: () => false,
    hostname: 'qa-host',
    tmpDir: fx.tmp,
    ...overrides,
  };
}

const byId = (result, id) => result.checks.find((c) => c.id === id);

describe('db-guard: URL validation', () => {
  it('1. refuses invalid URLs', () => {
    for (const raw of [
      '',
      'nada',
      'mysql://u:p@localhost/x_test',
      'postgresql://localhost:99999/x_test',
    ]) {
      assert.equal(parseTestDatabaseUrl(raw).ok, false, raw);
    }
  });
  it('2. refuses databases without the _test suffix', () => {
    for (const db of ['gastrohub', 'gastrohub_testing', 'test_gastrohub', '_test']) {
      const result = parseTestDatabaseUrl(`postgresql://u:p@localhost:5442/${db}`);
      assert.equal(result.ok, false, db);
    }
  });
  it('3. refuses remote hosts even with _test, and parameters that could change the target', () => {
    for (const raw of [
      'postgresql://u:p@db.example.com:5432/gastrohub_test',
      'postgresql://u:p@10.0.0.5:5432/gastrohub_test',
      'postgresql://u:p@localhost.example.com/gastrohub_test',
      'postgresql://u:p@localhost:5442/gastrohub_test?host=db.example.com',
    ]) {
      const result = parseTestDatabaseUrl(raw);
      assert.equal(result.ok, false, raw);
      assert.doesNotMatch(result.reason, /u:p|example\.com\/|:p@/);
    }
  });
  it('4. accepts localhost, 127.0.0.1 and ::1', () => {
    for (const [raw, host] of [
      ['postgresql://u:p@localhost:5442/gastrohub_test', 'localhost'],
      ['postgres://u:p@127.0.0.1:5442/gastrohub_test?schema=public', '127.0.0.1'],
      ['postgresql://u:p@[::1]:5442/gastrohub_test', '::1'],
    ]) {
      const result = parseTestDatabaseUrl(raw);
      assert.equal(result.ok, true, raw);
      assert.equal(result.target.host, host);
    }
    assert.equal(
      describeTarget({ host: '::1', port: 5442, database: 'gastrohub_test' }),
      '[::1]:5442/gastrohub_test',
    );
  });
  it('5. refuses different frontend and backend URLs without showing credentials', () => {
    const result = resolveTestDatabase({
      env: {},
      frontendEnvFile: { TEST_DATABASE_URL: URL_OK },
      backendEnvFile: {
        TEST_DATABASE_URL: 'postgresql://gastrohub:outra@localhost:5442/outro_test',
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /divergem/);
    assert.match(result.reason, /localhost:5442\/gastrohub_test/);
    assert.match(result.reason, /localhost:5442\/outro_test/);
    assert.doesNotMatch(result.reason, new RegExp(`${PASSWORD}|outra`));
    const same = resolveTestDatabase({
      env: {},
      frontendEnvFile: { TEST_DATABASE_URL: URL_OK },
      backendEnvFile: { TEST_DATABASE_URL: URL_OK },
    });
    assert.equal(same.ok, true);
    const missing = resolveTestDatabase({
      env: {},
      frontendEnvFile: { TEST_DATABASE_URL: URL_OK },
      backendEnvFile: {},
    });
    assert.equal(missing.ok, false);
  });
});

describe('functional agent: prechecks', () => {
  it('6. does not run any suite when PostgreSQL is unavailable', async () => {
    const fx = await fixture();
    const calls = [];
    const result = await run(
      context(fx, { probeTcp: async () => false, runScript: fakeRunner({ fx, calls }) }),
    );
    assert.equal(calls.length, 0);
    assert.equal(byId(result, 'functional-postgres').status, 'not_run');
    assert.equal(byId(result, 'functional-postgres').classification, 'infra');
    assert.equal(byId(result, 'backend-api-tests').status, 'not_run');
    assert.equal(byId(result, 'frontend-e2e').status, 'not_run');
    assert.equal(
      byId(result, 'functional-db-guard').summary.includes('localhost:5442/gastrohub_test'),
      true,
    );
  });

  it('7. does not run when the backend is missing', async () => {
    const fx = await fixture({ backend: false });
    const calls = [];
    const result = await run(context(fx, { runScript: fakeRunner({ fx, calls }) }));
    assert.equal(calls.length, 0);
    assert.match(byId(result, 'functional-backend-setup').reason, /não foi encontrado/);
    assert.equal(byId(result, 'functional-lock').status, 'not_run');
  });

  it('8. reports missing dependencies; without Playwright only the API tests run', async () => {
    const fx = await fixture({ backendDeps: false });
    const calls = [];
    const noDeps = await run(context(fx, { runScript: fakeRunner({ fx, calls }) }));
    assert.equal(calls.length, 0);
    assert.match(byId(noDeps, 'functional-backend-setup').reason, /node_modules\/vitest/);

    const fx2 = await fixture({ frontendDeps: false });
    const calls2 = [];
    const noPlaywright = await run(
      context(fx2, { runScript: fakeRunner({ fx: fx2, calls: calls2 }) }),
    );
    assert.deepEqual(
      calls2.map((c) => c.script),
      ['test'],
    );
    assert.match(byId(noPlaywright, 'functional-frontend-setup').reason, /@playwright\/test/);
    assert.equal(byId(noPlaywright, 'frontend-e2e').status, 'not_run');

    const fx3 = await fixture();
    const noChromium = await run(
      context(fx3, {
        chromiumPath: async () => path.join(fx3.base, 'nao-existe'),
        runScript: fakeRunner({ fx: fx3 }),
      }),
    );
    assert.match(
      byId(noChromium, 'functional-frontend-setup').reason,
      /playwright install chromium/,
    );
  });

  it('9. does not start the E2E when a port is busy', async () => {
    const fx = await fixture();
    const calls = [];
    const result = await run(
      context(fx, {
        probeTcp: async (host, port) => port === 5442 || port === 5181,
        runScript: fakeRunner({ fx, calls }),
      }),
    );
    assert.match(byId(result, 'functional-ports').reason, /5181/);
    assert.equal(byId(result, 'frontend-e2e').status, 'not_run');
    assert.deepEqual(
      calls.map((c) => c.script),
      ['test'],
    );
  });
});

describe('functional agent: lock', () => {
  it('10. refuses while another run holds the lock', async () => {
    const fx = await fixture();
    const file = lockPath(TARGET, fx.lockDir);
    await writeFile(
      file,
      JSON.stringify({ pid: 4242, hostname: 'qa-host', runId: 'outra', createdAt: 'agora' }),
    );
    const calls = [];
    const result = await run(
      context(fx, { isProcessAlive: () => true, runScript: fakeRunner({ fx, calls }) }),
    );
    assert.equal(calls.length, 0);
    assert.match(byId(result, 'functional-lock').reason, /PID 4242/);
    assert.equal(existsSync(file), true);
  });

  it('11. never removes an orphaned or unreadable lock', async () => {
    const fx = await fixture();
    const file = lockPath(TARGET, fx.lockDir);
    await writeFile(
      file,
      JSON.stringify({ pid: 999999, hostname: 'qa-host', runId: 'velha', createdAt: 'ontem' }),
    );
    const orphan = await acquireLock(TARGET, {
      dir: fx.lockDir,
      runId: 'nova',
      hostname: 'qa-host',
      alive: () => false,
    });
    assert.equal(orphan.ok, false);
    assert.match(orphan.reason, /órfã/);
    assert.equal(existsSync(file), true);
    await writeFile(file, 'lixo');
    const unreadable = await acquireLock(TARGET, {
      dir: fx.lockDir,
      runId: 'nova',
      hostname: 'qa-host',
    });
    assert.equal(unreadable.ok, false);
    assert.equal(await readFile(file, 'utf8'), 'lixo');
  });

  it('25. releases the lock after failures and errors', async () => {
    const fx = await fixture();
    const result = await run(
      context(fx, {
        runScript: fakeRunner({ fx, backend: { throws: true }, e2e: { exitCode: 1 } }),
      }),
    );
    assert.equal(byId(result, 'functional-lock').status, 'passed');
    assert.equal(byId(result, 'backend-api-tests').status, 'failed');
    assert.equal(existsSync(lockPath(TARGET, fx.lockDir)), false);
    const again = await acquireLock(TARGET, {
      dir: fx.lockDir,
      runId: 'depois',
      hostname: 'qa-host',
    });
    assert.equal(again.ok, true);
    await again.release();
  });
});

describe('functional agent: child environment', () => {
  it('12. leaves the coordinator and user environment untouched, also when refusing', async () => {
    const before = JSON.stringify(process.env);
    const fx = await fixture();
    const env = parentEnv();
    const envBefore = JSON.stringify(env);
    await run(context(fx, { env, probeTcp: async () => false, runScript: fakeRunner({ fx }) }));
    await run(context(fx, { env, runScript: fakeRunner({ fx }) }));
    assert.equal(JSON.stringify(process.env), before);
    assert.equal(JSON.stringify(env), envBefore);
    assert.equal(
      process.env.QA_RUN_DIR,
      before.includes('QA_RUN_DIR') ? process.env.QA_RUN_DIR : undefined,
    );
  });

  it('13. forces the test providers and the validated database in each test process', async () => {
    const fx = await fixture();
    const calls = [];
    await run(context(fx, { runScript: fakeRunner({ fx, calls }) }));
    assert.deepEqual(
      calls.map((c) => c.script),
      ['test', 'test:e2e'],
    );
    for (const call of calls) {
      for (const [key, value] of Object.entries(FORCED_ENV))
        assert.equal(call.env[key], value, key);
      assert.equal(call.env.TEST_DATABASE_URL, URL_OK);
      assert.equal(call.env.DATABASE_URL, URL_OK);
      assert.equal(call.env.E2E_API_DIR, fx.backendDir);
      assert.equal(call.args.join(' ').includes(PASSWORD), false);
    }
    assert.equal(calls[0].cwd, fx.backendDir);
    assert.equal(calls[1].cwd, fx.root);
    assert.ok(calls[1].env.QA_RUN_DIR);
    assert.equal(calls[0].env.QA_RUN_DIR, undefined);
  });

  it('14. removes credentials of real providers', () => {
    const env = buildChildEnv(parentEnv({ Asaas_Base_Url: 'x', metrics_token: 'y' }), {
      EXTRA: '1',
    });
    for (const key of Object.keys(env)) {
      assert.doesNotMatch(key, /^ASAAS_|^WHATSAPP_ACCESS_TOKEN$|^METRICS_TOKEN$/i);
    }
    assert.equal(env.node_env, undefined); // case-insensitive replacement (Windows)
    assert.equal(env.NODE_ENV, 'test');
    assert.equal(env.ANTHROPIC_API_KEY, '');
    assert.equal(env.EXTRA, '1');
    assert.equal(env.PATH, process.env.PATH ?? '');
  });

  it('blocks the run when the backend could build a real provider', async () => {
    const fx = await fixture();
    await writeFile(
      path.join(fx.backendDir, 'src', 'container.ts'),
      BACKEND_CONTAINER_TS.replace("env.WHATSAPP_PROVIDER === 'cloud' && ", ''),
    );
    const calls = [];
    const result = await run(context(fx, { runScript: fakeRunner({ fx, calls }) }));
    assert.equal(calls.length, 0);
    assert.match(byId(result, 'functional-providers').reason, /WhatsApp/);

    const fx2 = await fixture();
    await put(
      path.join(fx2.root, 'e2e', 'delivery.spec.ts'),
      "await page.getByLabel('CEP').fill('01001000');",
    );
    const blocked = await run(context(fx2, { runScript: fakeRunner({ fx: fx2 }) }));
    assert.match(byId(blocked, 'functional-providers').reason, /delivery\.spec\.ts/);
  });
});

describe('functional agent: reporters', () => {
  it('15. turns valid Vitest and Playwright JSON into individual tests', async () => {
    const fx = await fixture();
    const vitest = parseVitestReport(VITEST_REPORT(fx.backendDir), fx.backendDir);
    assert.deepEqual(
      vitest.map((t) => [t.file, t.title, t.status, t.durationMs, t.retries]),
      [
        ['test/orders.test.ts', 'orders cria pedido', 'passed', 12, null],
        ['test/orders.test.ts', 'orders recusa sem itens', 'failed', 8, null],
        ['test/orders.test.ts', 'orders pendente', 'skipped', null, null],
      ],
    );
    assert.equal(vitest[1].classification, 'product');
    assert.doesNotMatch(vitest[1].error, new RegExp(PASSWORD));

    const playwright = parsePlaywrightReport(PLAYWRIGHT_REPORT(fx.root), fx.root);
    assert.deepEqual(
      playwright.map((t) => [t.file, t.project, t.title, t.status, t.retries, t.durationMs]),
      [
        ['e2e/customer.spec.ts', 'mobile', 'Cliente › faz um pedido', 'failed', 0, 1500],
        ['e2e/customer.spec.ts', 'mobile', 'Cliente › abre o cardápio', 'flaky', 1, 1600],
      ],
    );
    assert.equal(playwright[1].classification, 'flaky');

    const result = await run(context(fx, { runScript: fakeRunner({ fx }) }));
    const e2e = byId(result, 'frontend-e2e');
    assert.equal(e2e.status, 'failed');
    assert.equal(e2e.tests.length, 2);
    assert.equal(byId(result, 'backend-api-tests').status, 'failed'); // exit 0 but a failed test
    assert.match(byId(result, 'backend-api-tests').summary, /1 aprovados, 1 reprovados/);
  });

  it('16. handles a missing or invalid report without inventing results', async () => {
    const fx = await fixture();
    const result = await run(
      context(fx, {
        runScript: fakeRunner({
          fx,
          backend: { exitCode: 0, report: null },
          e2e: {
            exitCode: 1,
            report: 'isto não é json',
            output: 'Error: connect ECONNREFUSED 127.0.0.1:3341',
          },
        }),
      }),
    );
    const backend = byId(result, 'backend-api-tests');
    assert.equal(backend.status, 'warning');
    assert.equal(backend.tests, undefined);
    assert.match(backend.summary, /relatório JSON não foi gerado/);
    const e2e = byId(result, 'frontend-e2e');
    assert.equal(e2e.status, 'failed');
    assert.equal(e2e.classification, 'infra');
    assert.equal(e2e.tests, undefined);
  });

  it('marks flaky-only E2E runs as a warning, never as a pass', async () => {
    const fx = await fixture();
    const report = PLAYWRIGHT_REPORT(fx.root);
    report.suites[0].suites[0].specs.shift();
    const result = await run(
      context(fx, {
        runScript: fakeRunner({ fx, e2e: { exitCode: 0, report: JSON.stringify(report) } }),
      }),
    );
    const e2e = byId(result, 'frontend-e2e');
    assert.equal(e2e.status, 'warning');
    assert.equal(e2e.classification, 'flaky');
  });
});

describe('functional agent: failure classification', () => {
  it('17. infra', () => {
    assert.equal(classifyFailure('Error: connect ECONNREFUSED 127.0.0.1:5442'), 'infra');
    assert.equal(
      classifyFailure("PrismaClientInitializationError: P1001: Can't reach database server"),
      'infra',
    );
    assert.equal(classifyFailure('listen EADDRINUSE: address already in use :::3341'), 'infra');
    assert.equal(
      classifyFailure('Error: Timed out waiting 60000ms from config.webServer.'),
      'infra',
    );
    assert.equal(classifyFailure('Timed out waiting for global-setup'), 'infra');
  });
  it('18. test', () => {
    assert.equal(
      classifyFailure(
        "TypeError: Cannot read properties of undefined (reading 'id')",
        '    at login (e2e/helpers.ts:12:3)',
      ),
      'test',
    );
    assert.equal(
      classifyFailure('Error: strict mode violation: getByRole("button") resolved to 2 elements'),
      'test',
    );
    assert.equal(
      classifyFailure(
        'TypeError: x is not a function',
        '    at handler (src/modules/orders.ts:5:1)',
      ),
      'unknown',
    );
  });
  it('19. product, only from the error itself; unknown when in doubt', () => {
    assert.equal(
      classifyFailure('Error: expect(received).toBe(expected)\nExpected: 201\nReceived: 500'),
      'product',
    );
    assert.equal(classifyFailure('AssertionError: expected 403 to be 200'), 'product');
    assert.equal(
      classifyFailure(
        'Test timeout of 30000ms exceeded.',
        '    at expect(page).toHaveURL (e2e/x.spec.ts:3:1)',
      ),
      'unknown',
    );
    assert.equal(classifyFailure(''), 'unknown');
    assert.equal(classifyFailure('algo inesperado'), 'unknown');
  });
});

describe('functional agent: evidence and masking', () => {
  it('20. keeps evidence with relative paths, redacts text files and leaves out traces and MFA specs', async () => {
    const fx = await fixture();
    const source = path.join(fx.root, 'test-results');
    await put(path.join(source, 'customer-a-mobile', 'test-failed-1.png'), 'PNG');
    await put(path.join(source, 'customer-a-mobile', 'video.webm'), 'WEBM');
    await put(path.join(source, 'customer-a-mobile', 'trace.zip'), 'ZIP');
    await put(
      path.join(source, 'customer-a-mobile', 'error-context.md'),
      `senha password=${PASSWORD}`,
    );
    await put(path.join(source, 'platform-mfa-desktop', 'test-failed-1.png'), 'PNG');
    const old = path.join(source, 'customer-velho-desktop', 'test-failed-1.png');
    await put(old, 'PNG');
    await utimes(old, new Date(2000, 0, 1), new Date(2000, 0, 1));

    const evidence = await copyEvidence({
      source,
      runDir: fx.runDir,
      sensitivePrefixes: ['platform-'],
      since: Date.now() - 60_000,
    });
    assert.deepEqual(evidence.files.sort(), [
      'evidence/e2e/customer-a-mobile/error-context.md',
      'evidence/e2e/customer-a-mobile/test-failed-1.png',
      'evidence/e2e/customer-a-mobile/video.webm',
    ]);
    const reasons = evidence.skipped.map((s) => s.reason).join(' | ');
    assert.match(reasons, /trace/);
    assert.match(reasons, /MFA/);
    assert.match(reasons, /execução anterior/);
    const md = await readFile(
      path.join(fx.runDir, 'evidence', 'e2e', 'customer-a-mobile', 'error-context.md'),
      'utf8',
    );
    assert.doesNotMatch(md, new RegExp(PASSWORD));
    // Never overwrites: copying again into the same run folder fails instead.
    await assert.rejects(
      copyEvidence({ source, runDir: fx.runDir, sensitivePrefixes: ['platform-'] }),
    );
    assert.equal(
      (await stat(path.join(fx.runDir, 'evidence', 'e2e', 'customer-a-mobile', 'video.webm'))).size,
      4,
    );

    const result = await run(
      context({ ...fx, runDir: await tempDir() }, { runScript: fakeRunner({ fx }) }),
    );
    const failed = byId(result, 'frontend-e2e').tests.find((t) => t.status === 'failed');
    assert.deepEqual(failed.evidence, [
      'evidence/e2e/customer-Cliente-faz-um-pedido-mobile/test-failed-1.png',
    ]);
  });

  it('21. masks secrets in run.json, report.md, logs and evidence', async () => {
    const fx = await fixture();
    const resultsDir = await tempDir();
    const registry = {
      functional: async () => ({
        run: (ctx) =>
          run({ ...context(fx), ...ctx, runScript: fakeRunner({ fx, e2e: { exitCode: 1 } }) }),
      }),
    };
    const {
      dir,
      run: saved,
      exitCode,
    } = await runQa({
      agents: ['functional'],
      registry,
      root: fx.root,
      resultsDir,
      backendDir: fx.backendDir,
      write: () => {},
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(validate(schema, saved), []);
    const files = await readdir(dir, { recursive: true, withFileTypes: true });
    const texts = files.filter((f) => f.isFile() && !/\.(png|webm)$/.test(f.name));
    assert.ok(texts.some((f) => f.name.endsWith('.log')));
    for (const f of texts) {
      const text = await readFile(path.join(f.parentPath ?? f.path, f.name), 'utf8');
      assert.doesNotMatch(text, new RegExp(`${PASSWORD}|chave-real`), f.name);
    }
    const report = await readFile(path.join(dir, 'report.md'), 'utf8');
    assert.match(report, /Testes individuais/);
    assert.match(report, /Falhas por classificação/);
    assert.match(report, /evidence\/e2e\//);
    // Reporter output (Playwright's includes the environment) is not left behind.
    assert.deepEqual(await readdir(fx.tmp), []);
  });
});

describe('functional agent: integration with the coordinator', () => {
  it('22. runs the checks one at a time, the E2E even after API failures', async () => {
    const fx = await fixture();
    const calls = [];
    const result = await run(
      context(fx, {
        runScript: fakeRunner({ fx, calls, backend: { exitCode: 1 }, e2e: { exitCode: 0 } }),
      }),
    );
    assert.deepEqual(
      calls.map((c) => c.script),
      ['test', 'test:e2e'],
    );
    assert.ok(calls[1].startedAt >= calls[0].finishedAt);
    assert.deepEqual(
      result.checks.map((c) => c.id),
      [
        'functional-db-guard',
        'functional-providers',
        'functional-backend-setup',
        'functional-frontend-setup',
        'functional-postgres',
        'functional-ports',
        'functional-lock',
        'backend-api-tests',
        'functional-pre-e2e',
        'frontend-e2e',
      ],
    );
    assert.equal(byId(result, 'backend-api-tests').status, 'failed');
    assert.notEqual(byId(result, 'frontend-e2e').status, 'not_run');
  });

  it('23. keeps code as the only default agent and runs functional only when asked', async () => {
    assert.deepEqual(DEFAULT_AGENTS, ['code']);
    assert.deepEqual(Object.keys(AGENTS).sort(), ['code', 'functional']);
    const available = Object.keys(AGENTS);
    assert.deepEqual(parseArgs([], available, DEFAULT_AGENTS).agents, ['code']);
    assert.deepEqual(parseArgs(['--agents=code'], available, DEFAULT_AGENTS).agents, ['code']);
    assert.deepEqual(parseArgs(['--agents=code,functional'], available, DEFAULT_AGENTS).agents, [
      'code',
      'functional',
    ]);
    assert.throws(() => parseArgs(['--agents=visual'], available, DEFAULT_AGENTS));
    let functionalLoaded = false;
    await runQa({
      agents: ['code'],
      registry: {
        code: async () => ({
          run: async (ctx) => ({
            runId: ctx.runId,
            agent: 'code',
            status: 'not_run',
            startedAt: ctx.now().toISOString(),
            finishedAt: ctx.now().toISOString(),
            durationMs: 0,
            environment: ctx.environment,
            checks: [],
            notes: [],
          }),
        }),
        functional: async () => {
          functionalLoaded = true;
          return {};
        },
      },
      resultsDir: await tempDir(),
      write: () => {},
    });
    assert.equal(functionalLoaded, false);
  });

  it('24. accepts schema v1 and v2 results and rejects malformed tests', () => {
    const check = {
      id: 'x',
      title: 'X',
      command: 'pnpm run x',
      dependsOn: [],
      status: 'passed',
      startedAt: 'a',
      finishedAt: 'b',
      durationMs: 1,
      exitCode: 0,
      summary: null,
      error: null,
      outputTail: null,
      reason: null,
      logFile: null,
    };
    const runOf = (schemaVersion, c) => ({
      schemaVersion,
      runId: 'qa-1',
      status: 'passed',
      incomplete: false,
      exitCode: 0,
      startedAt: 'a',
      finishedAt: 'b',
      durationMs: 1,
      environment: {
        commitFront: null,
        frontDirty: null,
        commitBack: null,
        backDirty: null,
        backendStatus: null,
        nodeVersion: 'v22',
        platform: 'linux',
        osRelease: '6',
        arch: 'x64',
        packageManager: null,
      },
      requestedAgents: ['code'],
      summary: { total: 1, passed: 1, failed: 0, warning: 0, notRun: 0 },
      agents: [
        {
          runId: 'qa-1',
          agent: 'code',
          status: 'passed',
          startedAt: 'a',
          finishedAt: 'b',
          durationMs: 1,
          environment: {
            commitFront: null,
            frontDirty: null,
            commitBack: null,
            backDirty: null,
            backendStatus: null,
            nodeVersion: 'v22',
            platform: 'linux',
            osRelease: '6',
            arch: 'x64',
            packageManager: null,
          },
          checks: [c],
          notes: [],
        },
      ],
      notes: [],
    });
    const test = {
      id: 't',
      title: 'T',
      file: 'e2e/a.spec.ts',
      project: 'desktop',
      status: 'flaky',
      durationMs: 10,
      retries: 1,
      classification: 'flaky',
      evidence: ['evidence/e2e/a/test-failed-1.png'],
      error: null,
    };
    assert.deepEqual(validate(schema, runOf(1, check)), []);
    assert.deepEqual(
      validate(
        schema,
        runOf(2, { ...check, classification: 'infra', tests: [test], evidence: [] }),
      ),
      [],
    );
    assert.notDeepEqual(
      validate(schema, runOf(2, { ...check, tests: [{ ...test, status: 'quebrado' }] })),
      [],
    );
    assert.notDeepEqual(validate(schema, runOf(2, { ...check, classification: 'culpa' })), []);
    assert.notDeepEqual(
      validate(schema, runOf(2, { ...check, tests: [{ ...test, retries: undefined }] })),
      [],
    );
  });
});

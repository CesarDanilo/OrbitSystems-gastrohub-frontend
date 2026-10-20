import { existsSync } from 'node:fs';
import {
  constants,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { classifyChecks, runChecks } from '../coordinator/checks.mjs';
import {
  acquireLock,
  describeTarget,
  isProcessAlive,
  probeTcp,
  readEnvFile,
  resolveTestDatabase,
} from '../coordinator/db-guard.mjs';
import {
  cleanOutput,
  detectPackageManager,
  isSafeArg,
  runCommand,
  scriptInvocation,
} from '../coordinator/exec.mjs';

export const name = 'functional';
export const description =
  'Testes de API do backend (Vitest) e E2E (Playwright) contra o banco PostgreSQL local *_test.';

/**
 * Set in the test processes only (never in the coordinator or the user's shell). The backend reads
 * them before its own .env, and process.loadEnvFile never overrides a variable that is already set
 * (even to an empty string), so these values win over any .env.
 */
export const FORCED_ENV = {
  NODE_ENV: 'test',
  ANTHROPIC_API_KEY: '',
  BILLING_PROVIDER: 'none',
  WHATSAPP_PROVIDER: 'console',
  PAYMENT_PROVIDER: 'fake',
};
/** Credentials of real providers, removed from the test processes. */
export const DROPPED_ENV = [/^ASAAS_/i, /^WHATSAPP_ACCESS_TOKEN$/i, /^METRICS_TOKEN$/i];

const BACKEND_TIMEOUT_MS = 30 * 60_000;
const E2E_TIMEOUT_MS = 40 * 60_000;
const MAX_EVIDENCE_FILE = 50 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL = 300 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 300;
const BINARY_EVIDENCE = new Set(['.png', '.jpg', '.jpeg', '.webm']);
const TEXT_EVIDENCE = new Set(['.md', '.txt', '.json', '.log']);
/** Specs that show MFA secrets on screen: their screenshots, videos and page snapshots are not kept. */
const SENSITIVE_SPEC = /totp|otpauth|\bmfa\b|2fa|secret/i;
/** E2E flows that would reach a real gateway or postal-code service; they block the run. */
const REAL_PROVIDER_FLOW =
  /mercado\s*pago|mercadopago|payment-account|conta de pagamento|\bcep\b|zip ?code|postal|viacep|brasilapi/i;

/** The test process environment: parent minus real-provider credentials, plus forced values. */
export function buildChildEnv(parent, overrides = {}) {
  const replaced = new Set(
    [...Object.keys(FORCED_ENV), ...Object.keys(overrides)].map((k) => k.toUpperCase()),
  );
  const env = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (DROPPED_ENV.some((pattern) => pattern.test(key))) continue;
    if (replaced.has(key.toUpperCase())) continue; // Windows variables are case-insensitive
    env[key] = value;
  }
  return { ...env, ...FORCED_ENV, ...overrides };
}

const INFRA_FAILURE =
  /ECONNREFUSED|EADDRINUSE|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|\bP100[01]\b|Can't reach database server|config\.webServer|webServer|global-?setup|Executable doesn't exist|browserType\.launch/i;
const CODE_ERROR = /\b(?:TypeError|ReferenceError|SyntaxError)\b|strict mode violation/;
const EXPECTATION_FAILURE =
  /AssertionError|expect\(|\bExpected\b|\bReceived\b|\.to(?:Be|Equal|StrictEqual|Have|Match|Contain)/;
const TEST_FRAME =
  /(?:^|[\\/])(?:e2e|test|tests)[\\/]|\.(?:spec|test)\.[cm]?[jt]sx?\b|helpers\.[jt]s/;

/**
 * Suggested cause, for triage only (it never changes a status):
 * infra (database, ports, servers, browser), test (error raised by the test code itself),
 * product (an expectation about the product did not hold), unknown otherwise.
 * `flaky` is never guessed here: it only comes from the Playwright reporter.
 */
export function classifyFailure(message, stack = '') {
  const text = `${message ?? ''}\n${stack ?? ''}`;
  if (!text.trim()) return 'unknown';
  if (INFRA_FAILURE.test(text)) return 'infra';
  const head = String(message ?? '')
    .split('\n')
    .slice(0, 6)
    .join('\n');
  if (CODE_ERROR.test(head)) {
    if (/strict mode violation/.test(head)) return 'test';
    const frame = `${stack ?? ''}\n${message ?? ''}`
      .split('\n')
      .find((line) => /^\s*at\s/.test(line));
    return frame && TEST_FRAME.test(frame) ? 'test' : 'unknown';
  }
  if (EXPECTATION_FAILURE.test(head)) return 'product';
  return 'unknown';
}

/** Short, redacted failure text for reports. */
function shortError(text) {
  if (!text) return null;
  const clean = cleanOutput(String(text)).trim();
  if (!clean) return null;
  const lines = clean.split('\n').slice(0, 15).join('\n');
  return lines.length > 1500 ? `${lines.slice(0, 1500)}…` : lines;
}

function toPosix(file) {
  return file.split(path.sep).join('/').replace(/\\/g, '/');
}

function relativeFile(base, file) {
  if (!file) return null;
  const absolute = path.isAbsolute(file) ? file : path.resolve(base, file);
  return toPosix(path.relative(base, absolute));
}

function roundDuration(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Individual results from Vitest's JSON reporter. Vitest does not report retries: null. */
export function parseVitestReport(report, backendDir) {
  const tests = [];
  for (const file of report?.testResults ?? []) {
    const relative = relativeFile(backendDir, file.name);
    const assertions = file.assertionResults ?? [];
    for (const a of assertions) {
      const title =
        a.fullName || [...(a.ancestorTitles ?? []), a.title].filter(Boolean).join(' › ');
      const status =
        a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped';
      const message = (a.failureMessages ?? []).join('\n');
      tests.push({
        id: `${relative}::${title}`,
        title,
        file: relative,
        project: null,
        status,
        durationMs: roundDuration(a.duration),
        retries: null,
        classification: status === 'failed' ? classifyFailure(message) : null,
        evidence: [],
        error: status === 'failed' ? shortError(message) : null,
      });
    }
    // A file that failed to load (syntax error, failing hook) has no individual tests.
    if (file.status === 'failed' && !assertions.some((a) => a.status === 'failed')) {
      tests.push({
        id: `${relative}::(arquivo)`,
        title: `Arquivo de teste não executado: ${relative}`,
        file: relative,
        project: null,
        status: 'failed',
        durationMs: null,
        retries: null,
        classification: classifyFailure(file.message),
        evidence: [],
        error: shortError(file.message) ?? 'O arquivo falhou sem mensagem.',
      });
    }
  }
  return tests;
}

const PLAYWRIGHT_STATUS = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
};

/**
 * Individual results from Playwright's JSON reporter. evidenceFor(absolutePath) returns the copied
 * file's path relative to the run folder, or null when it was not kept.
 */
export function parsePlaywrightReport(report, root, evidenceFor = () => null) {
  const tests = [];
  const rootDir = report?.config?.rootDir ?? path.join(root, 'e2e');
  const walk = (suite, titles) => {
    const nextTitles =
      suite.title && !/\.[cm]?[jt]sx?$/.test(suite.title) ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      const file = relativeFile(root, spec.file ? path.resolve(rootDir, spec.file) : null);
      const title = [...nextTitles, spec.title].filter(Boolean).join(' › ');
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const status = PLAYWRIGHT_STATUS[t.status] ?? 'failed';
        const failing = [...results]
          .reverse()
          .find((r) => r.status !== 'passed' && r.status !== 'skipped');
        const errorObject = failing?.error ?? failing?.errors?.[0];
        const message = errorObject ? `${errorObject.message ?? ''}` : '';
        const evidence = [];
        for (const r of results) {
          for (const attachment of r.attachments ?? []) {
            const kept = attachment.path ? evidenceFor(attachment.path) : null;
            if (kept && !evidence.includes(kept)) evidence.push(kept);
          }
        }
        const total = results.reduce(
          (sum, r) => sum + (Number.isFinite(r.duration) ? r.duration : 0),
          0,
        );
        tests.push({
          id: `${t.projectName ?? ''}::${file}::${title}`,
          title,
          file,
          project: t.projectName ?? null,
          status,
          durationMs: results.length ? roundDuration(total) : null,
          retries: results.length ? Math.max(0, results.length - 1) : 0,
          classification:
            status === 'flaky'
              ? 'flaky'
              : status === 'failed'
                ? classifyFailure(message, errorObject?.stack)
                : null,
          evidence,
          error: status === 'failed' || status === 'flaky' ? shortError(message) : null,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, nextTitles);
  };
  for (const suite of report?.suites ?? []) walk(suite, []);
  // Errors outside any test: global setup, web servers, configuration.
  (report?.errors ?? []).forEach((error, index) => {
    tests.push({
      id: `playwright::erro-${index + 1}`,
      title: 'Erro fora dos testes (setup, servidores ou configuração)',
      file: null,
      project: null,
      status: 'failed',
      durationMs: null,
      retries: null,
      classification: classifyFailure(error?.message, error?.stack),
      evidence: [],
      error: shortError(error?.message) ?? 'Erro sem mensagem.',
    });
  });
  return tests;
}

function countTests(tests) {
  const count = (status) => tests.filter((t) => t.status === status).length;
  return {
    passed: count('passed'),
    failed: count('failed'),
    flaky: count('flaky'),
    skipped: count('skipped'),
  };
}

function testSummary(tests) {
  const c = countTests(tests);
  const parts = [`${c.passed} aprovados`, `${c.failed} reprovados`];
  if (c.flaky) parts.push(`${c.flaky} instáveis (flaky)`);
  parts.push(`${c.skipped} ignorados`);
  return `Testes: ${parts.join(', ')} (total ${tests.length}).`;
}

/** One classification for the check: the shared one of its failed tests, or a guess from the output. */
function checkClassification(tests, output) {
  const failed = tests.filter((t) => t.status === 'failed');
  if (failed.length) {
    const kinds = new Set(failed.map((t) => t.classification));
    return kinds.size === 1 ? [...kinds][0] : 'unknown';
  }
  if (tests.some((t) => t.status === 'flaky')) return 'flaky';
  return classifyFailure(output);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Result of a suite from its exit code, output and JSON report. The report can make the result
 * worse (failures with exit 0, flaky tests), never better than the exit code.
 */
export function suiteOutcome({ outcome, output, report, tests }) {
  const ok = outcome.exitCode === 0 && !outcome.error;
  if (!report) {
    return ok
      ? {
          status: 'warning',
          summary: 'O relatório JSON não foi gerado: resultados individuais indisponíveis.',
        }
      : {
          classification: classifyFailure(output),
          summary: 'A suíte falhou e não gerou relatório JSON (veja a saída).',
        };
  }
  const c = countTests(tests);
  const result = { tests, summary: testSummary(tests) };
  if (c.failed > 0 || !ok) {
    result.status = 'failed';
    result.classification = checkClassification(tests, output);
    if (ok) result.error = 'O relatório registra testes reprovados.';
  } else if (c.flaky > 0) {
    result.status = 'warning';
    result.classification = 'flaky';
  } else if (tests.length === 0) {
    result.status = 'warning';
    result.summary = 'Nenhum teste foi encontrado no relatório.';
  }
  return result;
}

async function listFiles(dir, base = dir, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(full, base, found);
    else if (entry.isFile()) found.push(path.relative(base, full));
  }
  return found;
}

/** Folder prefixes (as Playwright names test output folders) of specs that show MFA secrets. */
export async function sensitiveSpecPrefixes(e2eDir) {
  const prefixes = [];
  for (const file of await listFiles(e2eDir)) {
    if (!/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)) continue;
    let text = '';
    try {
      text = await readFile(path.join(e2eDir, file), 'utf8');
    } catch {
      // unreadable spec: treated as sensitive below
    }
    if (!text || SENSITIVE_SPEC.test(text) || /from '\.\/totp'/.test(text)) {
      prefixes.push(
        `${file.replace(/\.(?:spec|test)\.[cm]?[jt]sx?$/, '').replace(/[\\/]/g, '-')}-`,
      );
    }
  }
  return prefixes;
}

/**
 * Copies Playwright's test-results folder into the run, keeping its structure. Screenshots and
 * videos are copied as they are; text files are redacted; traces (trace.zip, with test passwords
 * and session cookies) and anything from specs that show MFA secrets are not kept.
 * Returns { files, map: absoluteSource → relative to runDir, skipped: [{ file, reason }] }.
 */
export async function copyEvidence({ source, runDir, sensitivePrefixes = [], since = 0 }) {
  const dest = path.join(runDir, 'evidence', 'e2e');
  const result = { files: [], map: new Map(), skipped: [] };
  if (!existsSync(source)) return result;
  let total = 0;
  for (const relative of await listFiles(source)) {
    const posix = toPosix(relative);
    const ext = path.extname(relative).toLowerCase();
    const topFolder = posix.split('/')[0];
    let reason = null;
    if (sensitivePrefixes.some((prefix) => topFolder.startsWith(prefix))) {
      reason = 'teste que exibe segredos de MFA na tela';
    } else if (ext === '.zip') {
      reason = 'trace do Playwright (contém senhas de teste e cookies)';
    } else if (!BINARY_EVIDENCE.has(ext) && !TEXT_EVIDENCE.has(ext)) {
      reason = 'tipo de arquivo não suportado';
    } else if (result.files.length >= MAX_EVIDENCE_FILES) {
      reason = 'limite de arquivos de evidência atingido';
    }
    const from = path.join(source, relative);
    let size = 0;
    if (!reason) {
      const info = await stat(from);
      size = info.size;
      if (info.mtimeMs < since) reason = 'arquivo de uma execução anterior';
      else if (size > MAX_EVIDENCE_FILE) reason = 'arquivo grande demais';
      else if (total + size > MAX_EVIDENCE_TOTAL) reason = 'limite total de evidências atingido';
    }
    if (reason) {
      result.skipped.push({ file: posix, reason });
      continue;
    }
    const to = path.join(dest, relative);
    await mkdir(path.dirname(to), { recursive: true });
    if (BINARY_EVIDENCE.has(ext)) {
      await copyFile(from, to, constants.COPYFILE_EXCL);
    } else {
      await writeFile(to, cleanOutput(await readFile(from, 'utf8')), { flag: 'wx' });
    }
    total += size;
    const kept = toPosix(path.relative(runDir, to));
    result.files.push(kept);
    result.map.set(path.resolve(from), kept);
  }
  return result;
}

function skippedSummary(skipped) {
  if (!skipped.length) return null;
  const byReason = new Map();
  for (const s of skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
  return [...byReason]
    .map(([reason, count]) => `${count} arquivo(s) não anexado(s): ${reason}`)
    .join('; ');
}

async function readPackageJson(dir) {
  return readJson(path.join(dir, 'package.json'));
}

/** Static proof that, with FORCED_ENV, the backend only builds fake or local providers. */
export async function checkProviders({ backendDir, root }) {
  const read = async (relative) => {
    try {
      return await readFile(path.join(backendDir, relative), 'utf8');
    } catch {
      return null;
    }
  };
  const envSource = await read('src/config/env.ts');
  const container = await read('src/container.ts');
  const seed = await read('prisma/seed.ts');
  if (!envSource || !container || !seed) {
    return 'Não foi possível ler src/config/env.ts, src/container.ts ou prisma/seed.ts do backend.';
  }
  const count = (text, pattern) => (text.match(pattern) ?? []).length;
  const rules = [
    [
      /PAYMENT_PROVIDER:\s*z\.enum\(\[\s*'fake'\s*\]\)/.test(envSource),
      'PAYMENT_PROVIDER aceita só "fake"',
    ],
    [
      /BILLING_PROVIDER:\s*z\.enum\(\[\s*'none',\s*'fake',\s*'asaas'\s*\]\)/.test(envSource) &&
        /env\.BILLING_PROVIDER === 'asaas'/.test(container) &&
        count(container, /new AsaasBillingProvider\(/g) === 1,
      'Asaas só é criado com BILLING_PROVIDER=asaas',
    ],
    [
      /env\.WHATSAPP_PROVIDER === 'cloud' && env\.WHATSAPP_ACCESS_TOKEN/.test(container) &&
        count(container, /new WhatsAppCloudProvider\(/g) === 1,
      'WhatsApp Cloud só é criado com WHATSAPP_PROVIDER=cloud e token',
    ],
    [
      /env\.ANTHROPIC_API_KEY\s*\?\s*new ClaudeInterpreter\(/.test(container) &&
        count(container, /new ClaudeInterpreter\(/g) === 1,
      'o interpretador de IA real só é criado com ANTHROPIC_API_KEY',
    ],
    [
      /new FakePaymentProvider\(/.test(container) && !/new MercadoPago\w*\(/.test(container),
      'o provedor de pagamento padrão é o fake',
    ],
    [!/paymentAccount/i.test(seed), 'o seed não cria contas de gateway de pagamento'],
  ];
  const broken = rules.filter(([ok]) => !ok).map(([, label]) => label);
  if (broken.length) {
    return `A seleção de provedores do backend mudou e não pôde ser confirmada (${broken.join('; ')}).`;
  }
  const e2eDir = path.join(root, 'e2e');
  for (const file of await listFiles(e2eDir)) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const text = await readFile(path.join(e2eDir, file), 'utf8').catch(() => '');
    if (REAL_PROVIDER_FLOW.test(text)) {
      return `O E2E ${toPosix(path.join('e2e', file))} usa um fluxo de gateway de pagamento ou CEP, que no servidor do E2E chamaria um provedor real.`;
    }
  }
  const probe = buildChildEnv({
    ASAAS_API_KEY: 'x',
    WHATSAPP_ACCESS_TOKEN: 'x',
    ANTHROPIC_API_KEY: 'x',
  });
  const forced = Object.entries(FORCED_ENV).every(([key, value]) => probe[key] === value);
  if (!forced || 'ASAAS_API_KEY' in probe || 'WHATSAPP_ACCESS_TOKEN' in probe) {
    return 'O ambiente dos testes não ficou com os valores forçados.';
  }
  return null;
}

const notRun = (reason) => ({ status: 'not_run', reason, classification: 'infra' });

/**
 * context: { runId, runDir, root, backendDir, environment, now, saveLog, onOutput, onCheckStart }
 * plus injectable dependencies for tests: { env, probeTcp, chromiumPath, lockDir, isProcessAlive,
 * hostname, runScript, tmpDir }.
 */
export async function run(context) {
  const now = context.now ?? (() => new Date());
  const startedAt = now();
  const root = context.root;
  const backendDir = context.backendDir ?? path.resolve(root, '../gastrohub-backend');
  const parentEnv = context.env ?? process.env;
  const probe = context.probeTcp ?? probeTcp;
  const relBackend = toPosix(path.relative(root, backendDir)) || '.';
  const notes = [
    'O E2E recria o banco *_test (migrate deploy, TRUNCATE de todas as tabelas e seed) e os testes de API aplicam migrations nele; nada é executado fora do banco validado.',
    'Traces do Playwright (trace.zip) não são anexados: contêm senhas de teste e cookies de sessão. Para inspecionar, rode o E2E manualmente.',
    'A trava só coordena execuções do `pnpm qa`; um `pnpm test` ou `pnpm test:e2e` manual ao mesmo tempo não é bloqueado.',
    'O servidor do E2E continua com o provedor real de CEP (BrasilAPI/ViaCEP); nenhum E2E atual consulta CEP, e o agente recusa a execução se algum passar a consultar.',
    'As classificações (infra, test, product, flaky, unknown) são sugestões para triagem e não mudam nenhum status.',
  ];

  const frontendPackage = await readPackageJson(root);
  const packageManager = detectPackageManager(root, frontendPackage);
  const state = {
    db: null,
    backendPackage: null,
    backendPackageManager: packageManager,
    ports: null,
    lock: null,
    rawDir: null,
  };

  // Reporter output stays outside the run folder: Playwright's JSON report includes the web server
  // configuration, environment variables included. It is read, then deleted.
  try {
    const base = context.tmpDir ?? os.tmpdir();
    let dir = await mkdtemp(path.join(base, 'gastrohub-qa-raw-'));
    if (!isSafeArg(dir)) {
      await rm(dir, { recursive: true, force: true });
      dir = await mkdtemp(path.join(context.runDir, '.raw-'));
    }
    state.rawDir = dir;
  } catch {
    // reported by the backend-setup check
  }

  const childEnv = (extra = {}) =>
    buildChildEnv(parentEnv, {
      TEST_DATABASE_URL: state.db.value,
      DATABASE_URL: state.db.value,
      E2E_API_DIR: backendDir,
      ...extra,
    });

  const runScript =
    context.runScript ??
    ((script, definition) =>
      runCommand({
        ...scriptInvocation(definition.packageManager, script, process.env, definition.args ?? []),
        cwd: definition.cwd,
        env: definition.env,
        timeoutMs: definition.timeoutMs,
        onOutput: context.onOutput,
      }));

  const backendDeps = [
    'functional-db-guard',
    'functional-providers',
    'functional-backend-setup',
    'functional-postgres',
    'functional-lock',
  ];
  const definitions = [
    {
      id: 'functional-db-guard',
      title: 'Banco de teste local, *_test e igual nos dois repositórios',
      command: '(verificação interna: TEST_DATABASE_URL)',
      run: async () => {
        const resolved = resolveTestDatabase({
          env: parentEnv,
          frontendEnvFile: readEnvFile(path.join(root, '.env')),
          backendEnvFile: readEnvFile(path.join(backendDir, '.env')),
        });
        if (!resolved.ok) return notRun(resolved.reason);
        state.db = resolved;
        return {
          status: 'passed',
          summary: `Banco ${describeTarget(resolved.target)} (fontes: ${resolved.sources.join(', ')}).`,
        };
      },
    },
    {
      id: 'functional-providers',
      title: 'Provedores externos desligados (pagamento, cobrança, WhatsApp, IA)',
      command: '(verificação interna: código do backend e ambiente dos testes)',
      run: async () => {
        const problem = await checkProviders({ backendDir, root });
        if (problem) return notRun(`${problem} Execução bloqueada até revisar.`);
        return {
          status: 'passed',
          summary:
            'Ambiente dos testes: NODE_ENV=test, PAYMENT_PROVIDER=fake, BILLING_PROVIDER=none, WHATSAPP_PROVIDER=console, sem chave de IA; credenciais ASAAS_*, WHATSAPP_ACCESS_TOKEN e METRICS_TOKEN removidas.',
        };
      },
    },
    {
      id: 'functional-backend-setup',
      title: 'Backend presente, dependências instaladas e scripts esperados',
      command: `(verificação interna: ${relBackend})`,
      run: async () => {
        if (!existsSync(backendDir))
          return notRun(`O backend não foi encontrado em ${relBackend}.`);
        const pkg = await readPackageJson(backendDir);
        if (!pkg) return notRun(`package.json do backend ausente ou inválido em ${relBackend}.`);
        const missing = [
          'node_modules/vitest/package.json',
          'node_modules/prisma/package.json',
          'node_modules/tsx/package.json',
          'src/server.ts',
          'test/global-setup.ts',
          'e2e-reset.ts',
          'prisma/seed.ts',
          'scripts/create-platform-admin.ts',
        ].filter((file) => !existsSync(path.join(backendDir, file)));
        if (missing.length) {
          return notRun(
            `Faltam no backend: ${missing.join(', ')}. Rode \`pnpm install\` em ${relBackend} (o agente não instala nada).`,
          );
        }
        if (!state.rawDir)
          return notRun('Não foi possível criar a pasta temporária dos relatórios.');
        state.backendPackage = pkg;
        state.backendPackageManager = detectPackageManager(backendDir, pkg);
        return { status: 'passed', summary: `Backend em ${relBackend}.` };
      },
    },
    {
      id: 'functional-frontend-setup',
      title: 'Playwright, Chromium e configuração do E2E',
      command: '(verificação interna: node_modules e playwright.config.ts)',
      run: async () => {
        const missing = [
          'node_modules/@playwright/test/package.json',
          'node_modules/vite/package.json',
        ].filter((file) => !existsSync(path.join(root, file)));
        if (missing.length) {
          return notRun(
            `Faltam no frontend: ${missing.join(', ')}. Rode \`pnpm install\` (o agente não instala nada).`,
          );
        }
        let config;
        try {
          config = await readFile(path.join(root, 'playwright.config.ts'), 'utf8');
        } catch {
          return notRun('playwright.config.ts não encontrado.');
        }
        if (!config.includes('QA_RUN_DIR')) {
          return notRun(
            'playwright.config.ts não grava o relatório JSON (QA_RUN_DIR); resultados individuais ficariam indisponíveis.',
          );
        }
        const api = /const API_PORT = (\d+)/.exec(config);
        const web = /const WEB_PORT = (\d+)/.exec(config);
        if (!api || !web)
          return notRun('Não foi possível ler API_PORT e WEB_PORT do playwright.config.ts.');
        state.ports = [Number(api[1]), Number(web[1])];
        let executable;
        try {
          executable = context.chromiumPath
            ? await context.chromiumPath()
            : createRequire(path.join(root, 'package.json'))(
                '@playwright/test',
              ).chromium.executablePath();
        } catch {
          executable = null;
        }
        if (!executable || !existsSync(executable)) {
          return notRun(
            'O Chromium do Playwright não está instalado. Rode `pnpm exec playwright install chromium` (o agente não instala nada).',
          );
        }
        return {
          status: 'passed',
          summary: `Portas do E2E: API ${state.ports[0]}, web ${state.ports[1]}.`,
        };
      },
    },
    {
      id: 'functional-postgres',
      title: 'PostgreSQL local acessível',
      dependsOn: ['functional-db-guard'],
      blockedClassification: 'infra',
      command: '(verificação interna: conexão TCP)',
      run: async () => {
        const { host, port } = state.db.target;
        if (!(await probe(host, port))) {
          return notRun(
            `Nada responde em ${describeTarget(state.db.target)}. Suba o banco de teste (por exemplo \`docker compose up -d postgres\` no backend); o agente não sobe o Docker.`,
          );
        }
        return { status: 'passed', summary: `${describeTarget(state.db.target)} aceita conexões.` };
      },
    },
    {
      id: 'functional-ports',
      title: 'Portas do E2E livres',
      dependsOn: ['functional-frontend-setup'],
      blockedClassification: 'infra',
      command: '(verificação interna: portas da API e do web)',
      run: async () => portsCheck(state.ports, probe),
    },
    {
      id: 'functional-lock',
      title: 'Trava exclusiva do banco de teste',
      dependsOn: [
        'functional-db-guard',
        'functional-providers',
        'functional-backend-setup',
        'functional-postgres',
      ],
      blockedClassification: 'infra',
      command: '(verificação interna: trava em pasta temporária)',
      run: async () => {
        const lock = await acquireLock(state.db.target, {
          dir: context.lockDir ?? os.tmpdir(),
          runId: context.runId,
          hostname: context.hostname ?? os.hostname(),
          alive: context.isProcessAlive ?? isProcessAlive,
          now,
        });
        if (!lock.ok) return notRun(lock.reason);
        state.lock = lock;
        return {
          status: 'passed',
          summary: `Trava criada para ${describeTarget(state.db.target)}.`,
        };
      },
    },
    {
      id: 'backend-api-tests',
      title: 'Testes de API do backend (Vitest, banco *_test)',
      script: 'test',
      expectedScript: 'vitest run',
      dependsOn: backendDeps,
      blockedClassification: 'infra',
      get scripts() {
        return state.backendPackage?.scripts ?? {};
      },
      get packageManager() {
        return state.backendPackageManager;
      },
      cwd: backendDir,
      get env() {
        return childEnv();
      },
      get args() {
        return [
          '--reporter=default',
          '--reporter=json',
          `--outputFile.json=${path.join(state.rawDir, 'vitest.json')}`,
        ];
      },
      timeoutMs: BACKEND_TIMEOUT_MS,
      displayArgs:
        '--reporter=default --reporter=json --outputFile.json=<pasta temporária>/vitest.json',
      displayCwd: relBackend,
      collect: async ({ outcome, output }) => {
        const report = await readJson(path.join(state.rawDir, 'vitest.json'));
        const tests = report ? parseVitestReport(report, backendDir) : [];
        return suiteOutcome({ outcome, output, report, tests });
      },
    },
    {
      id: 'functional-pre-e2e',
      title: 'Antes do E2E: PostgreSQL acessível e portas livres',
      dependsOn: ['functional-lock', 'functional-frontend-setup', 'functional-ports'],
      blockedClassification: 'infra',
      command: '(verificação interna: conexão TCP e portas)',
      run: async () => {
        if (!(await probe(state.db.target.host, state.db.target.port))) {
          return notRun(
            `O banco ${describeTarget(state.db.target)} parou de responder antes do E2E.`,
          );
        }
        return portsCheck(state.ports, probe);
      },
    },
    {
      id: 'frontend-e2e',
      title: 'Testes E2E (Playwright, desktop e mobile)',
      script: 'test:e2e',
      expectedScript: 'playwright test',
      dependsOn: [
        ...backendDeps,
        'functional-frontend-setup',
        'functional-ports',
        'functional-pre-e2e',
      ],
      blockedClassification: 'infra',
      scripts: frontendPackage?.scripts ?? {},
      packageManager,
      cwd: root,
      get env() {
        return childEnv({ QA_RUN_DIR: state.rawDir });
      },
      args: [],
      timeoutMs: E2E_TIMEOUT_MS,
      displayArgs: '',
      displayCwd: '.',
      collect: async ({ outcome, output }) => {
        const evidence = await copyEvidence({
          source: path.join(root, 'test-results'),
          runDir: context.runDir,
          sensitivePrefixes: await sensitiveSpecPrefixes(path.join(root, 'e2e')),
          // Playwright empties test-results when it starts; this also keeps out older files if it did not.
          since: Date.now() - (outcome.durationMs ?? 0) - 5_000,
        });
        const skipped = skippedSummary(evidence.skipped);
        if (skipped) notes.push(`Evidências do E2E: ${skipped}.`);
        const report = await readJson(path.join(state.rawDir, 'playwright.json'));
        const tests = report
          ? parsePlaywrightReport(
              report,
              root,
              (file) => evidence.map.get(path.resolve(file)) ?? null,
            )
          : [];
        const result = suiteOutcome({ outcome, output, report, tests });
        return evidence.files.length ? { ...result, evidence: evidence.files } : result;
      },
    },
  ];

  let checks;
  try {
    checks = await runChecks(definitions, {
      scripts: null,
      runScript,
      commandFor: (script, definition) =>
        [`${definition.packageManager} run ${script}`, definition.displayArgs]
          .filter(Boolean)
          .join(' ') +
        (definition.displayCwd && definition.displayCwd !== '.'
          ? ` (em ${definition.displayCwd})`
          : ''),
      now,
      saveLog: context.saveLog,
      onCheckStart: context.onCheckStart,
    });
  } finally {
    await state.lock?.release();
    if (state.rawDir) await rm(state.rawDir, { recursive: true, force: true }).catch(() => {});
  }
  const finishedAt = now();

  return {
    runId: context.runId,
    agent: name,
    status: classifyChecks(checks),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    environment: context.environment,
    checks,
    notes,
  };
}

async function portsCheck(ports, probe) {
  const busy = [];
  for (const port of ports) {
    for (const host of ['127.0.0.1', '::1']) {
      if ((await probe(host, port)) && !busy.includes(port)) busy.push(port);
    }
  }
  if (busy.length) {
    return notRun(
      `Porta(s) ${busy.join(', ')} já em uso; o E2E precisa delas livres (reuseExistingServer: false). Encerre o processo que as usa.`,
    );
  }
  return { status: 'passed', summary: `Portas ${ports.join(' e ')} livres.` };
}

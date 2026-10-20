import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  classifyChecks,
  classifyRun,
  exitCodeFor,
  runChecks,
  summarize,
} from '../coordinator/checks.mjs';
import { cleanOutput, redact, runCommand, scriptInvocation } from '../coordinator/exec.mjs';
import { renderMarkdown } from '../coordinator/report.mjs';
import { parseArgs, runQa, UsageError } from '../coordinator/run.mjs';
import { validate } from '../coordinator/schema-check.mjs';

const schema = JSON.parse(
  await readFile(new URL('../schema/qa-run.schema.json', import.meta.url), 'utf8'),
);
const tempDirs = [];
async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gastrohub-qa-test-'));
  tempDirs.push(dir);
  return dir;
}
after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

const check = (status) => ({ status });

describe('status classification', () => {
  it('passes only when every check ran and passed', () => {
    assert.equal(classifyChecks([check('passed'), check('passed')]), 'passed');
  });
  it('fails when any executed check failed', () => {
    assert.equal(classifyChecks([check('passed'), check('failed'), check('not_run')]), 'failed');
  });
  it('warns on warnings without failures', () => {
    assert.equal(classifyChecks([check('passed'), check('warning')]), 'warning');
  });
  it('never treats a check that did not run as a pass', () => {
    assert.equal(classifyChecks([check('passed'), check('not_run')]), 'warning');
  });
  it('is not_run when nothing was executed', () => {
    assert.equal(classifyChecks([]), 'not_run');
    assert.equal(classifyChecks([check('not_run'), check('not_run')]), 'not_run');
  });
  it('applies the same precedence to runs', () => {
    assert.equal(classifyRun([{ status: 'passed' }, { status: 'failed' }]), 'failed');
    assert.equal(classifyRun([{ status: 'passed' }, { status: 'warning' }]), 'warning');
    assert.equal(classifyRun([{ status: 'not_run' }]), 'not_run');
    assert.equal(classifyRun([]), 'not_run');
  });
  it('maps runs to exit codes', () => {
    assert.equal(exitCodeFor({ status: 'passed', incomplete: false }), 0);
    assert.equal(exitCodeFor({ status: 'warning', incomplete: false }), 0);
    assert.equal(exitCodeFor({ status: 'failed', incomplete: true }), 1);
    assert.equal(exitCodeFor({ status: 'warning', incomplete: true }), 2);
    assert.equal(exitCodeFor({ status: 'not_run', incomplete: true }), 2);
  });
  it('counts checks by status', () => {
    assert.deepEqual(summarize([check('passed'), check('failed'), check('not_run')]), {
      total: 3,
      passed: 1,
      failed: 1,
      warning: 0,
      notRun: 1,
    });
  });
});

describe('runChecks', () => {
  const definitions = [
    { id: 'lint', title: 'Lint', script: 'lint' },
    { id: 'typecheck', title: 'Typecheck', script: 'typecheck' },
    { id: 'test', title: 'Testes', script: 'test' },
    { id: 'build', title: 'Build', script: 'build', dependsOn: ['typecheck'] },
  ];
  const scripts = { lint: 'eslint .', typecheck: 'tsc', test: 'vitest run', build: 'vite build' };
  const options = (runScript, extra = {}) => ({
    scripts,
    runScript,
    commandFor: (s) => `pnpm run ${s}`,
    ...extra,
  });

  it('keeps running independent checks after a failure and keeps earlier results', async () => {
    const calls = [];
    const results = await runChecks(
      definitions,
      options(async (script) => {
        calls.push(script);
        return script === 'test'
          ? { exitCode: 1, output: 'FAIL src/a.test.ts\nTests 1 failed' }
          : { exitCode: 0, output: 'ok' };
      }),
    );
    assert.deepEqual(calls, ['lint', 'typecheck', 'test', 'build']);
    assert.deepEqual(
      results.map((r) => [r.id, r.status]),
      [
        ['lint', 'passed'],
        ['typecheck', 'passed'],
        ['test', 'failed'],
        ['build', 'passed'],
      ],
    );
    const failed = results[2];
    assert.equal(failed.exitCode, 1);
    assert.match(failed.error, /código 1/);
    assert.match(failed.outputTail, /Tests 1 failed/);
  });

  it('records a check as not_run when its dependency failed', async () => {
    const calls = [];
    const results = await runChecks(
      definitions,
      options(async (script) => {
        calls.push(script);
        return { exitCode: script === 'typecheck' ? 2 : 0, output: '' };
      }),
    );
    assert.ok(!calls.includes('build'));
    const build = results.find((r) => r.id === 'build');
    assert.equal(build.status, 'not_run');
    assert.match(build.reason, /Depende de "Typecheck", que falhou/);
    assert.equal(build.exitCode, null);
    assert.equal(build.durationMs, 0);
  });

  it('records a missing script as not_run instead of passed', async () => {
    const results = await runChecks(
      definitions,
      options(async () => ({ exitCode: 0, output: '' }), {
        scripts: { lint: 'eslint .', typecheck: 'tsc', build: 'vite build' },
      }),
    );
    const test = results.find((r) => r.id === 'test');
    assert.equal(test.status, 'not_run');
    assert.match(test.reason, /não existe no package\.json/);
    assert.equal(classifyChecks(results), 'warning');
  });

  it('refuses to run a script that would write files or touch the database', async () => {
    const calls = [];
    const results = await runChecks(
      [{ id: 'format', title: 'Formatação', script: 'format:check' }],
      options(
        async (s) => {
          calls.push(s);
          return { exitCode: 0, output: '' };
        },
        { scripts: { 'format:check': 'prettier --write .' } },
      ),
    );
    assert.deepEqual(calls, []);
    assert.equal(results[0].status, 'not_run');
    assert.match(results[0].reason, /segurança/);
  });

  it('turns a command that cannot start into a failure and goes on', async () => {
    const results = await runChecks(
      definitions.slice(0, 3),
      options(async (script) => {
        if (script === 'lint') throw new Error('spawn pnpm ENOENT');
        return { exitCode: 0, output: '' };
      }),
    );
    assert.equal(results[0].status, 'failed');
    assert.match(results[0].error, /ENOENT/);
    assert.equal(results[1].status, 'passed');
    assert.equal(results[2].status, 'passed');
  });

  it('marks a passing check with warnings as warning', async () => {
    const results = await runChecks(
      [
        {
          id: 'lint',
          title: 'Lint',
          script: 'lint',
          warning: (o) => (o.includes('warn') ? '1 aviso' : null),
        },
      ],
      options(async () => ({ exitCode: 0, output: '1 warn' })),
    );
    assert.equal(results[0].status, 'warning');
    assert.equal(results[0].summary, '1 aviso');
  });

  it('runs each check once, so a failure is never retried into a pass', async () => {
    let attempts = 0;
    const results = await runChecks(
      [{ id: 'test', title: 'Testes', script: 'test' }],
      options(async () => {
        attempts += 1;
        return { exitCode: attempts === 1 ? 1 : 0, output: '' };
      }),
    );
    assert.equal(attempts, 1);
    assert.equal(results[0].status, 'failed');
  });
});

describe('runCommand', () => {
  it('captures the exit code and output of a failing command', async () => {
    const result = await runCommand({
      command: process.execPath,
      args: ['-e', 'console.log("saida"); console.error("erro"); process.exit(3)'],
    });
    assert.equal(result.exitCode, 3);
    assert.match(result.output, /saida/);
    assert.match(result.output, /erro/);
    assert.equal(result.error, null);
  });

  it('reports a command that does not exist without throwing', async () => {
    const result = await runCommand({ command: 'gastrohub-qa-comando-inexistente' });
    assert.equal(result.exitCode, null);
    assert.match(result.error, /Falha ao iniciar/);
  });

  it('stops a command that exceeds the time limit', async () => {
    const result = await runCommand({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 30000)'],
      timeoutMs: 200,
    });
    assert.equal(result.timedOut, true);
    assert.match(result.error, /Tempo limite/);
  });

  it('runs scripts through the package manager entry point when available', () => {
    const viaNode = scriptInvocation('pnpm', 'lint', { npm_execpath: '/x/pnpm/bin/pnpm.cjs' });
    assert.equal(viaNode.command, process.execPath);
    assert.deepEqual(viaNode.args, ['/x/pnpm/bin/pnpm.cjs', 'run', 'lint']);
    assert.equal(viaNode.shell, false);
    const viaShell = scriptInvocation('pnpm', 'lint', {});
    assert.equal(viaShell.command, 'pnpm run lint');
    assert.equal(viaShell.shell, true);
  });
});

describe('redaction', () => {
  it('hides credentials from outputs', () => {
    const text = redact(
      'postgresql://gastrohub:s3cr3t@localhost:5442/db\nAPI_TOKEN=abc123\nAuthorization: Bearer xyz.789\nPAYMENT_WEBHOOK_SECRET: "valor"',
    );
    assert.doesNotMatch(text, /s3cr3t|abc123|xyz\.789|valor/);
    assert.match(text, /postgresql:\/\/\*\*\*:\*\*\*@localhost/);
  });
  it('strips terminal colors', () => {
    assert.equal(
      cleanOutput(`${String.fromCharCode(27)}[31mvermelho${String.fromCharCode(27)}[0m\r\n`),
      'vermelho\n',
    );
  });
});

describe('parseArgs', () => {
  const available = ['code'];
  it('defaults to every available agent', () => {
    assert.deepEqual(parseArgs([], available).agents, ['code']);
  });
  it('accepts --agents=, --agents <list> and a leading --', () => {
    assert.deepEqual(parseArgs(['--agents=code'], available).agents, ['code']);
    assert.deepEqual(parseArgs(['--', '--agents', 'code'], available).agents, ['code']);
  });
  it('rejects unknown agents and arguments', () => {
    assert.throws(() => parseArgs(['--agents=visual'], available), UsageError);
    assert.throws(() => parseArgs(['--agents='], available), UsageError);
    assert.throws(() => parseArgs(['--fix'], available), UsageError);
  });
});

function fakeAgent(checks) {
  return async () => ({
    run: async (context) => ({
      runId: context.runId,
      agent: 'fake',
      status: classifyChecks(checks),
      startedAt: '2026-10-20T12:00:00.000Z',
      finishedAt: '2026-10-20T12:00:01.000Z',
      durationMs: 1000,
      environment: context.environment,
      checks,
      notes: [],
    }),
  });
}

function checkResult(id, status, extra = {}) {
  return {
    id,
    title: `Verificação ${id}`,
    command: `pnpm run ${id}`,
    dependsOn: [],
    status,
    startedAt: '2026-10-20T12:00:00.000Z',
    finishedAt: '2026-10-20T12:00:01.000Z',
    durationMs: status === 'not_run' ? 0 : 1000,
    exitCode: status === 'not_run' ? null : status === 'failed' ? 1 : 0,
    summary: null,
    error: status === 'failed' ? 'O comando terminou com código 1.' : null,
    outputTail: status === 'failed' ? 'Error: quebrou | aqui' : null,
    reason: status === 'not_run' ? 'O script "x" não existe no package.json.' : null,
    logFile: null,
    ...extra,
  };
}

describe('runQa', () => {
  const quiet = () => {};

  it('writes a schema-valid run.json and a report, and fails with exit code 1', async () => {
    const resultsDir = await tempDir();
    const { run, dir, exitCode } = await runQa({
      agents: ['fake'],
      registry: { fake: fakeAgent([checkResult('lint', 'passed'), checkResult('test', 'failed')]) },
      resultsDir,
      backendDir: path.join(resultsDir, 'sem-backend'),
      write: quiet,
    });
    assert.equal(exitCode, 1);
    assert.equal(run.status, 'failed');
    assert.equal(run.environment.commitBack, null);
    assert.equal(run.environment.backendStatus, 'pasta não encontrada');
    const saved = JSON.parse(await readFile(path.join(dir, 'run.json'), 'utf8'));
    assert.deepEqual(validate(schema, saved), []);
    assert.deepEqual(saved.summary, { total: 2, passed: 1, failed: 1, warning: 0, notRun: 0 });
    const report = await readFile(path.join(dir, 'report.md'), 'utf8');
    assert.match(report, /Commit do backend \| indisponível \(pasta não encontrada\)/);
  });

  it('never reuses the folder of an earlier run', async () => {
    const resultsDir = await tempDir();
    const options = {
      agents: ['fake'],
      registry: { fake: fakeAgent([checkResult('lint', 'passed')]) },
      resultsDir,
      write: quiet,
      now: () => new Date('2026-10-20T12:00:00.000Z'),
    };
    const first = await runQa(options);
    const second = await runQa(options);
    assert.notEqual(first.run.runId, second.run.runId);
    assert.equal((await readdir(resultsDir)).length, 2);
    assert.equal(first.exitCode, 0);
  });

  it('reports an incomplete run with exit code 2 and nothing-executed as not_run', async () => {
    const resultsDir = await tempDir();
    const partial = await runQa({
      agents: ['fake'],
      registry: { fake: fakeAgent([checkResult('lint', 'passed'), checkResult('x', 'not_run')]) },
      resultsDir,
      write: quiet,
    });
    assert.equal(partial.run.status, 'warning');
    assert.equal(partial.run.incomplete, true);
    assert.equal(partial.exitCode, 2);

    const nothing = await runQa({
      agents: ['fake'],
      registry: { fake: fakeAgent([]) },
      resultsDir,
      write: quiet,
    });
    assert.equal(nothing.run.status, 'not_run');
    assert.equal(nothing.exitCode, 2);
  });

  it('records an agent crash as a failure instead of stopping the run', async () => {
    const resultsDir = await tempDir();
    const { run, exitCode } = await runQa({
      agents: ['broken'],
      registry: {
        broken: async () => ({
          run: async () => {
            throw new Error('boom');
          },
        }),
      },
      resultsDir,
      write: quiet,
    });
    assert.equal(exitCode, 1);
    assert.equal(run.agents[0].status, 'failed');
    assert.match(run.agents[0].notes[0], /boom/);
  });
});

describe('renderMarkdown', () => {
  it('shows the identification, summary, table, errors and skipped checks', () => {
    const checks = [
      checkResult('lint', 'passed'),
      checkResult('test', 'failed'),
      checkResult('build', 'not_run', { reason: 'Depende de "Typecheck", que falhou.' }),
    ];
    const run = {
      schemaVersion: 1,
      runId: 'qa-20261020-120000-abc1234-ffff',
      status: 'failed',
      incomplete: true,
      exitCode: 1,
      startedAt: '2026-10-20T12:00:00.000Z',
      finishedAt: '2026-10-20T12:01:05.000Z',
      durationMs: 65000,
      environment: {
        commitFront: 'abc1234def5678',
        frontDirty: true,
        commitBack: null,
        backDirty: null,
        backendStatus: 'pasta não encontrada',
        nodeVersion: 'v24.0.0',
        platform: 'win32',
        osRelease: '10.0.26100',
        arch: 'x64',
        packageManager: 'pnpm@12.9.1',
      },
      requestedAgents: ['code'],
      summary: summarize(checks),
      agents: [
        {
          runId: 'qa-20261020-120000-abc1234-ffff',
          agent: 'code',
          status: 'failed',
          startedAt: '2026-10-20T12:00:00.000Z',
          finishedAt: '2026-10-20T12:01:05.000Z',
          durationMs: 65000,
          environment: {},
          checks,
          notes: [],
        },
      ],
      notes: [],
    };
    const md = renderMarkdown(run);
    assert.match(md, /# Relatório de QA — qa-20261020-120000-abc1234-ffff/);
    assert.match(md, /`abc1234def56` \(com alterações locais não commitadas\)/);
    assert.match(md, /indisponível \(pasta não encontrada\)/);
    assert.match(md, /v24\.0\.0/);
    assert.match(md, /Status geral: ❌ failed/);
    assert.match(md, /Execução incompleta/);
    assert.match(md, /\| 1 \| 1 \| 0 \| 1 \| 3 \|/);
    assert.match(md, /\| Verificação test \| `pnpm run test` \| ❌ failed \| 1,0 s \| 1 \|/);
    assert.match(md, /Error: quebrou \| aqui/);
    assert.match(md, /- \*\*Verificação build\*\*: Depende de "Typecheck", que falhou\./);
    assert.match(md, /Duração total \| 1 min 05 s/);
  });
});

describe('review fixes', () => {
  const quiet = () => {};

  it('masks secrets on the terminal even when they arrive split across chunks', async () => {
    let terminal = '';
    const result = await runCommand({
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write("API_TO"); setTimeout(() => process.stdout.write("KEN=abc123\\nfim\\n"), 50)',
      ],
      onOutput: (text) => {
        terminal += text;
      },
    });
    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(terminal, /abc123/);
    assert.match(terminal, /API_TOKEN=\*\*\*/);
    assert.doesNotMatch(result.output, /abc123/);
  });

  it('stops the subprocesses of a command that exceeds the time limit', async () => {
    const script = [
      'const { spawn } = require("node:child_process");',
      'const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });',
      'console.log("GRANDCHILD " + g.pid);',
      'setInterval(() => {}, 1000);',
    ].join('\n');
    const result = await runCommand({
      command: process.execPath,
      args: ['-e', script],
      timeoutMs: 1000,
    });
    assert.equal(result.timedOut, true);
    assert.ok(result.durationMs < 10_000, `took ${result.durationMs} ms`);
    const pid = Number(/GRANDCHILD (\d+)/.exec(result.output)?.[1]);
    assert.ok(pid > 0, 'grandchild pid printed');
    await new Promise((r) => setTimeout(r, 500));
    assert.throws(() => process.kill(pid, 0), 'grandchild must not survive the timeout');
  });

  it('accepts only plain script names on the shell path', () => {
    assert.throws(() => scriptInvocation('pnpm', 'lint && echo x', {}), /Nome de script inválido/);
    assert.throws(() => scriptInvocation('pnpm', 'lint; rm', {}), /Nome de script inválido/);
    assert.throws(() => scriptInvocation('bash', 'lint', {}), /não suportado/);
    assert.equal(scriptInvocation('pnpm', 'format:check', {}).command, 'pnpm run format:check');
  });

  it('keeps finished results when writing a log fails', async () => {
    const results = await runChecks(
      [
        { id: 'lint', title: 'Lint', script: 'lint' },
        { id: 'test', title: 'Testes', script: 'test' },
      ],
      {
        scripts: { lint: 'eslint .', test: 'vitest run' },
        runScript: async (s) => ({ exitCode: s === 'test' ? 1 : 0, output: 'saída\n' }),
        commandFor: (s) => `pnpm run ${s}`,
        saveLog: async () => {
          throw new Error('ENOSPC: no space left on device');
        },
        onCheckStart: () => {
          throw new Error('terminal fechado');
        },
      },
    );
    assert.deepEqual(
      results.map((r) => r.status),
      ['passed', 'failed'],
    );
    assert.match(results[0].summary, /Log não gravado: ENOSPC/);
    assert.equal(results[0].logFile, null);
  });

  it('exits with 1 and flags the run as incomplete when failures and skipped checks coexist', async () => {
    const resultsDir = await tempDir();
    const { run, dir, exitCode } = await runQa({
      agents: ['fake'],
      registry: {
        fake: fakeAgent([checkResult('typecheck', 'failed'), checkResult('build', 'not_run')]),
      },
      resultsDir,
      write: quiet,
    });
    assert.equal(exitCode, 1);
    assert.equal(run.status, 'failed');
    assert.equal(run.incomplete, true);
    const report = await readFile(path.join(dir, 'report.md'), 'utf8');
    assert.match(report, /Status geral: ❌ failed · execução incompleta \(código de saída 1\)/);
    assert.match(report, /Além disso, houve falhas/);
  });

  it('exits with 3 when an agent result does not follow the schema', async () => {
    const resultsDir = await tempDir();
    const bad = { ...checkResult('lint', 'passed'), exitCode: 'zero' };
    const { run, exitCode } = await runQa({
      agents: ['fake'],
      registry: { fake: fakeAgent([bad]) },
      resultsDir,
      write: quiet,
    });
    assert.equal(exitCode, 3);
    assert.equal(run.exitCode, 3);
    assert.match(run.notes[0], /não segue o schema/);
  });

  it('keeps secrets printed by a check out of the terminal, logs, run.json and report', async () => {
    const resultsDir = await tempDir();
    let terminal = '';
    const secret = 'postgresql://gastrohub:SENHA-SECRETA@localhost/db';
    const agent = async () => ({
      run: async (context) => {
        const checks = await runChecks([{ id: 'leaky', title: 'Vaza', script: 'leaky' }], {
          scripts: { leaky: 'node leaky.js' },
          commandFor: (s) => `pnpm run ${s}`,
          saveLog: context.saveLog,
          runScript: () =>
            runCommand({
              command: process.execPath,
              args: ['-e', `console.error(${JSON.stringify(secret)}); process.exit(1)`],
              onOutput: context.onOutput,
            }),
        });
        return {
          runId: context.runId,
          agent: 'fake',
          status: classifyChecks(checks),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          environment: context.environment,
          checks,
          notes: [],
        };
      },
    });
    const { dir, exitCode } = await runQa({
      agents: ['fake'],
      registry: { fake: agent },
      resultsDir,
      write: (text) => {
        terminal += text;
      },
    });
    assert.equal(exitCode, 1);
    const files = ['run.json', 'report.md', 'logs/leaky.log'];
    for (const file of files) {
      const content = await readFile(path.join(dir, file), 'utf8');
      assert.doesNotMatch(content, /SENHA-SECRETA/, file);
    }
    assert.doesNotMatch(terminal, /SENHA-SECRETA/);
  });

  it('masks secrets in internal agent errors', async () => {
    const resultsDir = await tempDir();
    const { run } = await runQa({
      agents: ['broken'],
      registry: {
        broken: async () => ({
          run: async () => {
            throw new Error('conexão recusada em postgresql://u:SEGREDO@host/db');
          },
        }),
      },
      resultsDir,
      write: quiet,
    });
    assert.doesNotMatch(run.agents[0].notes[0], /SEGREDO/);
  });
});

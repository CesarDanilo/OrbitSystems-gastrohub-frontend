import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { CHECKS, eslintWarnings, run, vitestSummary } from '../agents/code.mjs';

const tempDirs = [];
after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

async function project(packageJson) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gastrohub-qa-code-'));
  tempDirs.push(dir);
  if (packageJson) await writeFile(path.join(dir, 'package.json'), JSON.stringify(packageJson));
  return dir;
}

const SCRIPTS = {
  lint: 'eslint .',
  'format:check': 'prettier --check .',
  typecheck: 'tsc -p tsconfig.json --noEmit',
  test: 'vitest run',
  build: 'tsc -p tsconfig.json --noEmit && vite build',
};

describe('code agent', () => {
  it('runs the existing scripts in order, without format or fix variants', async () => {
    const root = await project({ packageManager: 'pnpm@12.9.1', scripts: SCRIPTS });
    const calls = [];
    const result = await run({
      runId: 'qa-test',
      root,
      environment: {},
      runScript: async (script) => {
        calls.push(script);
        return { exitCode: 0, output: '' };
      },
    });
    assert.deepEqual(calls, ['lint', 'format:check', 'typecheck', 'test', 'build']);
    assert.equal(result.status, 'passed');
    assert.deepEqual(
      result.checks.map((c) => c.command),
      CHECKS.map((c) => `pnpm run ${c.script}`),
    );
  });

  it('skips the build when the typecheck fails and still runs the tests', async () => {
    const root = await project({ packageManager: 'pnpm@12.9.1', scripts: SCRIPTS });
    const calls = [];
    const result = await run({
      runId: 'qa-test',
      root,
      environment: {},
      runScript: async (script) => {
        calls.push(script);
        return { exitCode: script === 'typecheck' ? 2 : 0, output: 'src/a.ts(1,1): error TS2322' };
      },
    });
    assert.deepEqual(calls, ['lint', 'format:check', 'typecheck', 'test']);
    assert.equal(result.status, 'failed');
    assert.equal(result.checks.find((c) => c.id === 'frontend-build').status, 'not_run');
  });

  it('runs nothing and reports not_run without a package.json', async () => {
    const root = await project(null);
    const result = await run({
      runId: 'qa-test',
      root,
      environment: {},
      runScript: async () => assert.fail('nothing should run'),
    });
    assert.equal(result.status, 'not_run');
    assert.ok(result.checks.every((c) => c.status === 'not_run'));
    assert.match(result.notes[0], /package\.json/);
  });

  it('reads ESLint warnings and the Vitest summary', () => {
    assert.equal(eslintWarnings('✖ 3 problems (0 errors, 3 warnings)'), '3 aviso(s) do ESLint.');
    assert.equal(eslintWarnings('✖ 1 problem (1 error, 0 warnings)'), null);
    assert.equal(eslintWarnings(''), null);
    assert.equal(
      vitestSummary(' Test Files  16 passed (16)\n      Tests  114 passed (114)\n'),
      'Test Files  16 passed (16) · Tests  114 passed (114)',
    );
  });
});

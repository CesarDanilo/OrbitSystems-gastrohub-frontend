import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyChecks, runChecks } from '../coordinator/checks.mjs';
import { detectPackageManager, runCommand, scriptInvocation } from '../coordinator/exec.mjs';

export const name = 'code';
export const description = 'Lint, formatação, typecheck, testes unitários e build do frontend.';

/** ESLint exits 0 with warnings; they are reported as a warning, not as a pass. */
export function eslintWarnings(output) {
  const match = /\((\d+) errors?, (\d+) warnings?\)/.exec(output);
  return match && Number(match[2]) > 0 ? `${match[2]} aviso(s) do ESLint.` : null;
}

/** Vitest's own summary lines ("Test Files ...", "Tests ..."). */
export function vitestSummary(output) {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(Test Files|Tests)\s/.test(l));
  return lines.length ? lines.join(' · ') : null;
}

/**
 * The project's own scripts, in order. `build` runs `tsc --noEmit` before `vite build`, so it
 * depends on the typecheck: when the typecheck fails, the build is recorded as not_run.
 */
export const CHECKS = [
  { id: 'frontend-lint', title: 'Lint (ESLint)', script: 'lint', warning: eslintWarnings },
  { id: 'frontend-format', title: 'Formatação (Prettier, só verificação)', script: 'format:check' },
  { id: 'frontend-typecheck', title: 'TypeScript typecheck', script: 'typecheck' },
  {
    id: 'frontend-test',
    title: 'Testes unitários e de componentes (Vitest)',
    script: 'test',
    summarize: vitestSummary,
  },
  {
    id: 'frontend-build',
    title: 'Build de produção',
    script: 'build',
    dependsOn: ['frontend-typecheck'],
  },
];

async function readPackageJson(root) {
  try {
    return JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * context: { runId, root, environment, now, saveLog, onOutput, onCheckStart, runScript? }
 * runScript is injectable for tests; by default each script runs through the package manager.
 */
export async function run(context) {
  const now = context.now ?? (() => new Date());
  const startedAt = now();
  const packageJson = await readPackageJson(context.root);
  const notes = [];
  if (!packageJson) {
    notes.push('package.json não encontrado ou inválido: nenhum script pôde ser executado.');
  }
  const packageManager = detectPackageManager(context.root, packageJson);
  const runScript =
    context.runScript ??
    ((script) =>
      runCommand({
        ...scriptInvocation(packageManager, script),
        cwd: context.root,
        onOutput: context.onOutput,
      }));

  const checks = await runChecks(CHECKS, {
    scripts: packageJson?.scripts ?? null,
    runScript,
    commandFor: (script) => `${packageManager} run ${script}`,
    now,
    saveLog: context.saveLog,
    onCheckStart: context.onCheckStart,
  });
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

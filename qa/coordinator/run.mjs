/**
 * QA coordinator: runs the selected agents one after another, validates their results and
 * writes qa/results/<runId>/run.json and report.md. It never starts servers, changes the
 * environment, talks to external services or touches GitHub.
 *
 * Usage: pnpm qa [--agents=code]   (see qa/README.md)
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AGENTS, DEFAULT_AGENTS } from '../agents/index.mjs';
import { classifyChecks, classifyRun, exitCodeFor, isIncomplete, summarize } from './checks.mjs';
import { redact } from './exec.mjs';
import { renderMarkdown } from './report.mjs';
import { validate } from './schema-check.mjs';

const QA_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FRONT_ROOT = path.dirname(QA_DIR);
const SCHEMA_PATH = path.join(QA_DIR, 'schema', 'qa-run.schema.json');
const SCHEMA_VERSION = 2;

export const USAGE = `Uso: pnpm qa [--agents=<agente>[,<agente>...]]

  --agents=code,functional   Agentes a executar (padrão: ${DEFAULT_AGENTS.join(', ')}).
                             functional migra e limpa o banco local *_test: só roda se pedido.
  --help                     Mostra esta ajuda.

Agentes disponíveis: ${Object.keys(AGENTS).join(', ')}
Códigos de saída: 0 aprovado/avisos, 1 reprovado, 2 incompleto ou nada executado, 3 erro do coordenador.`;

export class UsageError extends Error {}

/** Accepts `--agents=a,b`, `--agents a,b` and a leading `--` (as in `pnpm qa -- --agents=code`). */
export function parseArgs(argv, available, defaults = available) {
  let agents = null;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--agents' || arg.startsWith('--agents=')) {
      const value = arg === '--agents' ? argv[++i] : arg.slice('--agents='.length);
      agents = (value ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      if (agents.length === 0) throw new UsageError('Informe ao menos um agente em --agents.');
    } else {
      throw new UsageError(`Argumento desconhecido: ${arg}`);
    }
  }
  const selected = [...new Set(agents ?? defaults)];
  const unknown = selected.filter((a) => !available.includes(a));
  if (unknown.length) {
    throw new UsageError(
      `Agente(s) desconhecido(s): ${unknown.join(', ')}. Disponíveis: ${available.join(', ')}.`,
    );
  }
  return { agents: selected, help };
}

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 10_000 }, (error, stdout) =>
      resolve(error ? null : stdout.trim()),
    );
  });
}

function samePath(a, b) {
  const norm = (p) => {
    let resolved = path.resolve(p);
    try {
      resolved = realpathSync(resolved);
    } catch {
      // keep the resolved path
    }
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

/** Commit and dirty flag of the repository rooted exactly at `dir` (never a parent repository). */
export async function repoInfo(dir) {
  if (!dir || !existsSync(dir))
    return { commit: null, dirty: null, reason: 'pasta não encontrada' };
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!top || !samePath(top, dir)) {
    return {
      commit: null,
      dirty: null,
      reason: 'não é um repositório Git (ou o Git não está disponível)',
    };
  }
  const commit = await git(dir, ['rev-parse', 'HEAD']);
  if (!commit) return { commit: null, dirty: null, reason: 'repositório sem commits' };
  const status = await git(dir, ['--no-optional-locks', 'status', '--porcelain']);
  return { commit, dirty: status === null ? null : status.length > 0, reason: null };
}

export async function collectEnvironment(root, backendDir) {
  const [front, back] = await Promise.all([repoInfo(root), repoInfo(backendDir)]);
  let packageManager = null;
  try {
    packageManager =
      JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).packageManager ?? null;
  } catch {
    // reported by the agents that need package.json
  }
  return {
    commitFront: front.commit,
    frontDirty: front.dirty,
    commitBack: back.commit,
    backDirty: back.dirty,
    backendStatus: back.reason,
    nodeVersion: process.version,
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    packageManager,
  };
}

function newRunId(date, commit) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `qa-${stamp}-${commit ? commit.slice(0, 7) : 'nocommit'}-${randomBytes(2).toString('hex')}`;
}

/** Creates a new run folder; an existing folder is never reused, so earlier reports stay intact. */
async function createRunDir(resultsDir, date, commit) {
  await mkdir(resultsDir, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    const runId = newRunId(date, commit);
    const dir = path.join(resultsDir, runId);
    try {
      await mkdir(dir);
      return { runId, dir };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Não foi possível criar uma pasta de execução única.');
}

/** The coordinator, not the agent, has the last word on an agent's status. */
function normalizeAgent(result) {
  if (result.checks.length) return { ...result, status: classifyChecks(result.checks) };
  if (result.status === 'passed' || result.status === 'warning')
    return { ...result, status: 'not_run' };
  return result;
}

export async function runQa({
  agents,
  registry = AGENTS,
  root = FRONT_ROOT,
  resultsDir = path.join(QA_DIR, 'results'),
  backendDir = path.resolve(root, process.env.E2E_API_DIR ?? '../gastrohub-backend'),
  now = () => new Date(),
  write = (text) => process.stdout.write(text),
}) {
  const started = now();
  const environment = await collectEnvironment(root, backendDir);
  const { runId, dir } = await createRunDir(resultsDir, started, environment.commitFront);
  write(`QA ${runId}\nResultados em ${dir}\n`);

  const saveLog = async (id, text) => {
    await mkdir(path.join(dir, 'logs'), { recursive: true });
    const file = path.join('logs', `${id}.log`);
    await writeFile(path.join(dir, file), text, { flag: 'wx' });
    return file.split(path.sep).join('/');
  };

  const results = [];
  for (const name of agents) {
    const agentStarted = now();
    let result;
    try {
      const agent = await registry[name]();
      result = await agent.run({
        runId,
        runDir: dir,
        root,
        backendDir,
        environment,
        now,
        saveLog,
        onOutput: write,
        onCheckStart: (check, command) => write(`\n▶ [${name}] ${check.title}: ${command}\n`),
      });
    } catch (error) {
      const at = now();
      result = {
        runId,
        agent: name,
        status: 'failed',
        startedAt: agentStarted.toISOString(),
        finishedAt: at.toISOString(),
        durationMs: Math.max(0, at.getTime() - agentStarted.getTime()),
        environment,
        checks: [],
        notes: [`Erro interno do agente: ${redact(String(error?.message ?? error))}`],
      };
    }
    results.push(normalizeAgent(result));
  }

  const finished = now();
  const status = classifyRun(results);
  const run = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    status,
    incomplete: isIncomplete(results),
    exitCode: 0,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    environment,
    requestedAgents: agents,
    summary: summarize(results.flatMap((a) => a.checks)),
    agents: results,
    notes: [],
  };
  run.exitCode = exitCodeFor(run);

  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const problems = validate(schema, run);
  if (problems.length) {
    run.exitCode = 3;
    run.notes.push(`O resultado não segue o schema: ${problems.slice(0, 10).join('; ')}`);
  }

  await writeFile(path.join(dir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, { flag: 'wx' });
  await writeFile(path.join(dir, 'report.md'), renderMarkdown(run), { flag: 'wx' });

  const s = run.summary;
  write(
    `\nQA ${run.status.toUpperCase()}${run.incomplete ? ' (incompleta)' : ''} — código de saída ${run.exitCode}: ` +
      `${s.passed} aprovadas, ${s.failed} reprovadas, ${s.warning} com avisos, ${s.notRun} não executadas.\n` +
      `Relatório: ${path.join(dir, 'report.md')}\n`,
  );
  for (const note of run.notes) write(`${note}\n`);
  return { run, dir, exitCode: run.exitCode };
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv, Object.keys(AGENTS), DEFAULT_AGENTS);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 3;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const { exitCode } = await runQa({ agents: options.agents });
  return exitCode;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`Erro do coordenador de QA: ${redact(String(error?.stack ?? error))}\n`);
      process.exitCode = 3;
    },
  );
}

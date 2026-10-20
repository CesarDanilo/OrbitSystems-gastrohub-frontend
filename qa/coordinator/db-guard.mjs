/**
 * Proves, before any test touches a database, that the frontend E2E and the backend API tests
 * will use the same local *_test PostgreSQL database, and makes runs exclusive per database.
 * URLs are never printed: only `host:port/database` leaves this module.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const DEFAULT_PG_PORT = 5432;
/** Query parameters that only tune the connection; anything else (host, port...) is refused. */
const SAFE_PARAMS = new Set([
  'schema',
  'sslmode',
  'connect_timeout',
  'application_name',
  'connection_limit',
  'pool_timeout',
]);

/** `host:port/database`, the only form in which a target is ever shown. */
export function describeTarget(target) {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${host}:${target.port}/${target.database}`;
}

/** Validates one TEST_DATABASE_URL. Never returns or embeds the URL itself. */
export function parseTestDatabaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'não está definida' };
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'não é uma URL válida' };
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    return { ok: false, reason: 'não é uma URL PostgreSQL (postgresql://)' };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!LOCAL_HOSTS.includes(host)) {
    return {
      ok: false,
      reason: `o host não é local (aceitos: ${LOCAL_HOSTS.join(', ')}); hosts remotos são recusados mesmo com _test`,
    };
  }
  const port = url.port ? Number(url.port) : DEFAULT_PG_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: 'a porta é inválida' };
  }
  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return { ok: false, reason: 'o nome do banco é inválido' };
  }
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    return { ok: false, reason: 'o nome do banco está ausente ou tem caracteres não suportados' };
  }
  if (!database.endsWith('_test') || database === '_test') {
    return { ok: false, reason: 'o nome do banco não termina em _test' };
  }
  if (url.hash) return { ok: false, reason: 'a URL tem fragmento (#), o que não é suportado' };
  for (const key of url.searchParams.keys()) {
    if (!SAFE_PARAMS.has(key.toLowerCase())) {
      return {
        ok: false,
        reason: `o parâmetro de conexão "${key}" não é aceito (pode mudar o destino)`,
      };
    }
  }
  return { ok: true, target: { host, port, database } };
}

/** Values of a .env file (same parser Node uses for process.loadEnvFile); {} when absent. */
export function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return parseEnv(readFileSync(file, 'utf8'));
}

/**
 * The URL each suite will really use. Both playwright.config.ts and the backend test setup call
 * process.loadEnvFile('.env'), which never overrides a variable already set in the environment:
 * the environment wins, then each repository's .env.
 *
 * Every defined source must be identical; otherwise the run is refused (no guessing which one
 * wins). Returns { ok, value, target, sources } or { ok: false, reason }.
 */
export function resolveTestDatabase({ env, frontendEnvFile, backendEnvFile }) {
  const sources = [
    { name: 'variável de ambiente TEST_DATABASE_URL', value: env.TEST_DATABASE_URL },
    { name: 'TEST_DATABASE_URL do .env do frontend', value: frontendEnvFile.TEST_DATABASE_URL },
    { name: 'TEST_DATABASE_URL do .env do backend', value: backendEnvFile.TEST_DATABASE_URL },
  ].filter((s) => s.value !== undefined);

  const frontend = env.TEST_DATABASE_URL ?? frontendEnvFile.TEST_DATABASE_URL;
  const backend = env.TEST_DATABASE_URL ?? backendEnvFile.TEST_DATABASE_URL;
  if (frontend === undefined) {
    return {
      ok: false,
      reason: 'TEST_DATABASE_URL não está definida para o E2E (ambiente ou .env do frontend).',
    };
  }
  if (backend === undefined) {
    return {
      ok: false,
      reason: 'TEST_DATABASE_URL não está definida para o backend (ambiente ou .env do backend).',
    };
  }
  for (const source of sources) {
    const parsed = parseTestDatabaseUrl(source.value);
    if (!parsed.ok) return { ok: false, reason: `A ${source.name} ${parsed.reason}.` };
  }
  const distinct = new Set(sources.map((s) => s.value.trim()));
  if (distinct.size > 1) {
    const described = sources.map(
      (s) => `${s.name} → ${describeTarget(parseTestDatabaseUrl(s.value).target)}`,
    );
    return {
      ok: false,
      reason: `As configurações do banco de teste divergem (${described.join('; ')}). Deixe todas iguais.`,
    };
  }
  const value = frontend.trim();
  return {
    ok: true,
    value,
    target: parseTestDatabaseUrl(value).target,
    sources: sources.map((s) => s.name),
  };
}

/** True when something accepts a TCP connection on host:port within the timeout. */
export function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export function lockPath(target, dir = os.tmpdir()) {
  const host = target.host.replace(/[^a-z0-9]/gi, '_');
  return path.join(dir, `gastrohub-qa-${host}-${target.port}-${target.database}.lock`);
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM'; // exists, owned by someone else
  }
}

/**
 * Exclusive lock per database, created atomically (flag wx). An existing lock is never removed
 * here: active, orphaned or unreadable, the run is refused and the reason says what to do.
 * Returns { ok, release } or { ok: false, reason }.
 */
export async function acquireLock(
  target,
  {
    dir = os.tmpdir(),
    runId,
    hostname = os.hostname(),
    alive = isProcessAlive,
    now = () => new Date(),
  } = {},
) {
  const file = lockPath(target, dir);
  const owner = {
    pid: process.pid,
    hostname,
    runId,
    createdAt: now().toISOString(),
    target: describeTarget(target),
  };
  try {
    await writeFile(file, `${JSON.stringify(owner, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      return {
        ok: false,
        reason: `Não foi possível criar a trava ${file}: ${error.code ?? error.message}.`,
      };
    }
    let current = null;
    try {
      current = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      // unreadable: ownership cannot be established
    }
    if (!current || !Number.isInteger(current.pid)) {
      return {
        ok: false,
        reason: `Já existe uma trava ilegível em ${file}; como o dono não pode ser identificado, a execução foi recusada. Apague o arquivo só depois de confirmar que nenhuma execução de QA está em andamento.`,
      };
    }
    if (current.hostname !== hostname) {
      return {
        ok: false,
        reason: `A trava ${file} pertence a outra máquina (${current.hostname}); execução recusada.`,
      };
    }
    if (alive(current.pid)) {
      return {
        ok: false,
        reason: `Outra execução de QA (PID ${current.pid}, desde ${current.createdAt}) já usa ${describeTarget(target)}; execução recusada.`,
      };
    }
    return {
      ok: false,
      reason: `A trava ${file} é órfã (o PID ${current.pid} não existe mais, criada em ${current.createdAt}). Ela não é removida automaticamente: confirme que nada está rodando e apague o arquivo.`,
    };
  }
  let released = false;
  return {
    ok: true,
    file,
    release: async () => {
      if (released) return;
      released = true;
      try {
        const current = JSON.parse(await readFile(file, 'utf8'));
        if (current.pid === owner.pid && current.runId === owner.runId) await unlink(file);
      } catch {
        // already gone or replaced: never remove someone else's lock
      }
    },
  };
}

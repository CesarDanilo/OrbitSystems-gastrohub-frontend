import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Output kept in memory per command; older output is dropped (the end is what explains a failure). */
const MAX_OUTPUT_CHARS = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 20 * 60_000;
/** After a timeout: time for a graceful stop, then a forced kill, then give up on open pipes. */
const KILL_GRACE_MS = 5_000;
const CLOSE_GRACE_MS = 2_000;
/** Unfinished line flushed to the terminal anyway once it gets this long. */
const MAX_PENDING_LINE = 8_192;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;
/** Extra script arguments: options and paths only, nothing a shell would interpret. */
const SAFE_ARG = /^[A-Za-z0-9_@+=:,./\\-]+$/;

export function isSafeArg(arg) {
  return SAFE_ARG.test(arg);
}

/** Hides credentials that commands may print: URLs with passwords, bearer tokens, KEY=value secrets. */
export function redact(text) {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@'"]+:[^\s@'"]+@/gi, '$1***:***@')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 ***')
    .replace(
      /\b([A-Za-z0-9_]*(?:secret|token|password|passwd|api_?key|private_?key)[A-Za-z0-9_]*)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1$2***',
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,})/g,
      '***',
    );
}

/** Removes terminal colors, normalizes line endings and redacts secrets. */
export function cleanOutput(text) {
  return redact(text.replace(ANSI, '').replace(/\r\n?/g, '\n'));
}

/** Last lines of an output, bounded in size, for reports. */
export function tail(text, maxLines = 40, maxChars = 4000) {
  const lines = text.trimEnd().split('\n');
  let result = lines.slice(-maxLines).join('\n');
  if (result.length > maxChars) result = result.slice(-maxChars);
  return result;
}

export function detectPackageManager(root, packageJson) {
  const declared = /^(pnpm|npm|yarn)@/.exec(packageJson?.packageManager ?? '')?.[1];
  if (declared) return declared;
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * How to run `<pm> run <script>`. Under `pnpm qa` the package manager exposes its own entry
 * point in npm_execpath, so it runs through Node without a shell (same on Windows and Linux).
 * Otherwise (`node qa/coordinator/run.mjs`) it goes through the system shell, which resolves
 * pnpm.cmd on Windows; the script name and extra arguments are validated first so nothing else
 * reaches the shell. Extra arguments go after the script name (`pnpm run test --reporter=json`),
 * which pnpm hands to the script without changing it.
 */
export function scriptInvocation(packageManager, script, env = process.env, extraArgs = []) {
  if (!['pnpm', 'npm', 'yarn'].includes(packageManager)) {
    throw new Error(`Gerenciador de pacotes não suportado: ${packageManager}`);
  }
  if (!SAFE_SCRIPT_NAME.test(script)) throw new Error(`Nome de script inválido: ${script}`);
  for (const arg of extraArgs) {
    if (!SAFE_ARG.test(arg))
      throw new Error(`Argumento não suportado (espaço ou caractere especial): ${arg}`);
  }
  const display = [packageManager, 'run', script, ...extraArgs].join(' ');
  const execPath = env.npm_execpath ?? '';
  if (
    /\.(c?js|mjs)$/i.test(execPath) &&
    path.basename(execPath).toLowerCase().includes(packageManager)
  ) {
    return {
      command: process.execPath,
      args: [execPath, 'run', script, ...extraArgs],
      shell: false,
      display,
    };
  }
  return { command: display, args: [], shell: true, display };
}

/**
 * Stops a command and everything it started. Windows: taskkill /T on the process tree. Elsewhere
 * the command runs in its own process group (detached), so the whole group gets the signal.
 */
function killTree(child, signal) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => {});
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

/** Commands still running, so an interrupted coordinator (Ctrl+C) does not leave them behind. */
const active = new Set();
let signalsHooked = false;
function hookSignals() {
  if (signalsHooked || process.platform === 'win32') return; // Windows: Ctrl+C reaches the tree
  signalsHooked = true;
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.once(signal, () => {
      for (const child of active) killTree(child, 'SIGKILL');
      process.exit(code);
    });
  }
}

/** Sends output to the terminal one complete line at a time, redacted. */
function lineWriter(onOutput) {
  let pending = '';
  const emit = (text) => {
    try {
      onOutput(redact(text));
    } catch {
      // the terminal is a convenience; results do not depend on it
    }
  };
  return {
    write(text) {
      pending += text;
      const end = pending.lastIndexOf('\n');
      if (end === -1) {
        if (pending.length > MAX_PENDING_LINE) {
          emit(pending);
          pending = '';
        }
        return;
      }
      emit(pending.slice(0, end + 1));
      pending = pending.slice(end + 1);
    },
    flush() {
      if (pending) emit(pending);
      pending = '';
    },
  };
}

/**
 * Runs one command and always resolves (never rejects), so a failing or missing command never
 * stops the checks that come after it. Terminal output and the returned output are redacted.
 */
export function runCommand({
  command,
  args = [],
  cwd,
  shell = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onOutput,
  env,
}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const terminal = onOutput ? lineWriter(onOutput) : null;
    const timers = [];
    let output = '';
    let settled = false;
    let timedOut = false;
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      if (child) active.delete(child);
      terminal?.flush();
      resolve({
        ...result,
        output: cleanOutput(output),
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    };
    const append = (chunk) => {
      const text = chunk.toString();
      terminal?.write(text);
      output += text;
      if (output.length > MAX_OUTPUT_CHARS) {
        // Drop the partial first line too, so a cut secret is not left half visible.
        const cut = output.length - MAX_OUTPUT_CHARS;
        output = output.slice(output.indexOf('\n', cut) + 1 || cut);
      }
    };
    const timeoutError = `Tempo limite de ${timeoutMs} ms excedido; o comando foi interrompido.`;

    try {
      child = spawn(command, args, {
        cwd,
        shell,
        // Child-only environment when given; the coordinator's own process.env is never changed.
        ...(env ? { env } : {}),
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish({
        exitCode: null,
        signal: null,
        error: `Falha ao iniciar o comando: ${error.message}`,
      });
      return;
    }
    active.add(child);
    hookSignals();
    timers.push(
      setTimeout(() => {
        timedOut = true;
        killTree(child, 'SIGTERM');
        timers.push(
          setTimeout(() => {
            killTree(child, 'SIGKILL');
            // A process outside the tree may still hold the pipes open: stop waiting for it.
            timers.push(
              setTimeout(() => {
                child.stdout?.destroy();
                child.stderr?.destroy();
                finish({ exitCode: null, signal: 'SIGKILL', error: timeoutError });
              }, CLOSE_GRACE_MS),
            );
          }, KILL_GRACE_MS),
        );
      }, timeoutMs),
    );
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) =>
      finish({
        exitCode: null,
        signal: null,
        error: `Falha ao iniciar o comando: ${error.message}`,
      }),
    );
    child.on('close', (code, signal) =>
      finish({ exitCode: code, signal, error: timedOut ? timeoutError : null }),
    );
  });
}

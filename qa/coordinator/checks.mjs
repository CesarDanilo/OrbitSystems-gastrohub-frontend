import { redact, tail } from './exec.mjs';

/** Status vocabulary shared by checks, agents and runs. */
export const STATUSES = ['passed', 'failed', 'warning', 'not_run'];

/**
 * Scripts whose definition looks like it writes files, touches a database or runs E2E are never
 * executed by a QA check, even if a script with the expected name exists.
 */
export const UNSAFE_SCRIPT =
  /--write\b|--fix\b|\bmigrate\b|\bseed\b|\breset\b|\bplaywright\b|\brimraf\b|\brm\s+-|\bdel\s/i;

/**
 * Agent status from its checks:
 * - not_run: nothing was executed;
 * - failed: at least one executed check failed;
 * - warning: warnings, or some checks were not executed (a missing check is never a pass);
 * - passed: every check ran and passed.
 */
export function classifyChecks(checks) {
  if (!checks.some((c) => c.status !== 'not_run')) return 'not_run';
  if (checks.some((c) => c.status === 'failed')) return 'failed';
  if (checks.some((c) => c.status === 'warning' || c.status === 'not_run')) return 'warning';
  return 'passed';
}

/** Run status from agent statuses, with the same precedence as classifyChecks. */
export function classifyRun(agents) {
  if (!agents.some((a) => a.status !== 'not_run')) return 'not_run';
  if (agents.some((a) => a.status === 'failed')) return 'failed';
  if (agents.some((a) => a.status === 'warning' || a.status === 'not_run')) return 'warning';
  return 'passed';
}

export function summarize(checks) {
  const count = (status) => checks.filter((c) => c.status === status).length;
  return {
    total: checks.length,
    passed: count('passed'),
    failed: count('failed'),
    warning: count('warning'),
    notRun: count('not_run'),
  };
}

/** A run is incomplete when an agent or a check did not run. */
export function isIncomplete(agents) {
  return agents.some((a) => a.status === 'not_run' || a.checks.some((c) => c.status === 'not_run'));
}

/**
 * Deterministic precedence (3, coordinator error, is set by run.mjs and wins over all):
 * 1 when any check failed, even if others did not run (the run is then also `incomplete`);
 * 2 when nothing failed but the run is incomplete or nothing ran; 0 only for a complete run
 * with no failures (non-blocking warnings allowed).
 */
export function exitCodeFor(run) {
  if (run.status === 'failed') return 1;
  if (run.status === 'not_run' || run.incomplete) return 2;
  return 0;
}

function lastLine(output) {
  const lines = output.split('\n').filter((l) => l.trim());
  const line = lines.at(-1)?.trim() ?? '';
  return line ? line.slice(0, 300) : null;
}

/** Runs an optional callback; a broken callback never discards a check result. */
function safely(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function blockedReason(definition, scripts, previous) {
  for (const dependency of definition.dependsOn ?? []) {
    const result = previous.find((r) => r.id === dependency);
    if (!result) return `Depende de "${dependency}", que não faz parte desta execução.`;
    if (result.status === 'failed') return `Depende de "${result.title}", que falhou.`;
    if (result.status === 'not_run') return `Depende de "${result.title}", que não foi executada.`;
  }
  if (definition.run) return null; // in-process check: no script involved
  const available = definition.scripts ?? scripts;
  if (!available || !Object.hasOwn(available, definition.script)) {
    return `O script "${definition.script}" não existe no package.json${definition.scripts ? ' correspondente' : ''}.`;
  }
  const body = available[definition.script];
  if (definition.expectedScript !== undefined) {
    // Checks that are allowed to touch the test database pin the exact script they run.
    if (body.trim() !== definition.expectedScript) {
      return `O script "${definition.script}" mudou ("${body}"; esperado "${definition.expectedScript}"); revise antes de executar.`;
    }
  } else if (UNSAFE_SCRIPT.test(body)) {
    return `O script "${definition.script}" parece alterar arquivos, banco ou rodar E2E ("${body}"); não foi executado por segurança.`;
  }
  return null;
}

const SEVERITY = { passed: 0, warning: 1, failed: 2 };

function notRun(base, at, reason, classification) {
  return {
    ...base,
    status: 'not_run',
    startedAt: at,
    finishedAt: at,
    durationMs: 0,
    exitCode: null,
    summary: null,
    error: null,
    outputTail: null,
    reason,
    logFile: null,
    ...(classification !== undefined ? { classification } : {}),
  };
}

/** In-process check (`definition.run`): returns { status, summary?, error?, reason?, classification? }. */
async function runInProcess(definition, base, now) {
  const started = now();
  let outcome;
  try {
    outcome = await definition.run();
  } catch (error) {
    outcome = {
      status: 'failed',
      error: `Erro interno da verificação: ${redact(String(error?.message ?? error))}`,
      classification: 'unknown',
    };
  }
  const finished = now();
  if (outcome.status === 'not_run') {
    return notRun(
      base,
      finished.toISOString(),
      outcome.reason ?? 'não executada',
      outcome.classification ?? null,
    );
  }
  return {
    ...base,
    status: outcome.status,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    exitCode: null,
    summary: outcome.summary ?? null,
    error: outcome.error ?? null,
    outputTail: null,
    reason: null,
    logFile: null,
    ...(outcome.classification !== undefined ? { classification: outcome.classification } : {}),
  };
}

/**
 * Runs check definitions in order, one at a time. A failure is recorded and the next independent
 * checks still run; a check whose dependency failed or did not run is recorded as not_run with
 * the reason. Each check runs once: there are no retries that could turn a failure into a pass.
 *
 * definition:
 *   { id, title, dependsOn?, blockedClassification?, warning?(output), summarize?(output) } plus
 *   - run(): an in-process check, or
 *   - script, with optional scripts (package.json scripts of another repository), expectedScript
 *     (exact script body required), and anything runScript(script, definition) needs (cwd, env,
 *     args, timeoutMs); collect?({ outcome, output }) reads reporter files and returns
 *     { tests?, evidence?, classification?, summary?, status? } — status can only make the
 *     result worse (passed → warning → failed), never better.
 */
export async function runChecks(
  definitions,
  { scripts, runScript, commandFor, now = () => new Date(), saveLog, onCheckStart },
) {
  const results = [];
  for (const definition of definitions) {
    const command = definition.run
      ? (definition.command ?? '(verificação interna do coordenador)')
      : commandFor(definition.script, definition);
    const base = {
      id: definition.id,
      title: definition.title,
      command,
      dependsOn: definition.dependsOn ?? [],
    };
    const reason = blockedReason(definition, scripts, results);
    if (reason) {
      results.push(notRun(base, now().toISOString(), reason, definition.blockedClassification));
      continue;
    }

    safely(() => onCheckStart?.(definition, command));
    if (definition.run) {
      results.push(await runInProcess(definition, base, now));
      continue;
    }

    const started = now();
    let outcome;
    try {
      outcome = await runScript(definition.script, definition);
    } catch (error) {
      outcome = {
        exitCode: null,
        output: '',
        error: `Falha ao executar: ${redact(String(error?.message ?? error))}`,
      };
    }
    const finished = now();
    // runCommand already redacts; redacting again covers any other runner (defense in depth).
    const output = redact(outcome.output ?? '');
    const ok = outcome.exitCode === 0 && !outcome.error;
    const warning = ok ? safely(() => definition.warning?.(output) ?? null, null) : null;
    let status = ok ? (warning ? 'warning' : 'passed') : 'failed';
    let error = null;
    if (!ok) {
      error =
        outcome.error ??
        (outcome.exitCode === null
          ? `O comando foi encerrado sem código de saída (sinal ${outcome.signal ?? 'desconhecido'}).`
          : `O comando terminou com código ${outcome.exitCode}.`);
    }

    let summary = warning ?? safely(() => (definition.summarize ?? lastLine)(output), null);
    let collected = null;
    if (definition.collect) {
      try {
        collected = await definition.collect({ outcome, output });
      } catch (collectError) {
        collected = {
          summary: `Resultados individuais indisponíveis: ${redact(String(collectError?.message ?? collectError))}`,
          status: 'warning',
        };
      }
      if (collected?.summary) summary = collected.summary;
      if (collected?.status && SEVERITY[collected.status] > SEVERITY[status]) {
        status = collected.status;
        if (status === 'failed' && !error)
          error = collected.error ?? 'O relatório de testes registra falhas.';
      }
    }

    let logFile = null;
    if (output && saveLog) {
      try {
        logFile = await saveLog(definition.id, output);
      } catch (saveError) {
        // The check already ran: keep its result and say why the log is missing.
        const note = `Log não gravado: ${redact(String(saveError?.message ?? saveError))}`;
        summary = summary ? `${summary} (${note})` : note;
      }
    }

    results.push({
      ...base,
      status,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: Math.max(0, finished.getTime() - started.getTime()),
      exitCode: outcome.exitCode ?? null,
      summary,
      error,
      outputTail: status === 'passed' || !output.trim() ? null : tail(output),
      reason: null,
      logFile,
      ...(collected?.classification !== undefined
        ? { classification: collected.classification }
        : {}),
      ...(collected?.tests ? { tests: collected.tests } : {}),
      ...(collected?.evidence ? { evidence: collected.evidence } : {}),
    });
  }
  return results;
}

/**
 * Agents the coordinator can run, loaded on demand. Each module exports `name`, `description`
 * and `run(context)`, which returns an agent result (see qa/schema/qa-run.schema.json).
 */
export const AGENTS = {
  code: () => import('./code.mjs'),
  functional: () => import('./functional.mjs'),
};

/**
 * What `pnpm qa` runs without --agents. `functional` migrates and empties the local test
 * database, so it only runs when asked for explicitly.
 */
export const DEFAULT_AGENTS = ['code'];

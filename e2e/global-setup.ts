import { execSync } from 'node:child_process';

/** Fresh, seeded test database for every E2E run. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/_test\b/.test(url))
    throw new Error('TEST_DATABASE_URL must point to a *_test database.');
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' };
  const run = (command: string) => execSync(command, { cwd: '../api', stdio: 'inherit', env });
  run('npx prisma migrate deploy');
  run('npx tsx e2e-reset.ts');
  run('npx tsx prisma/seed.ts');
}

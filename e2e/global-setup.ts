import { execSync } from 'node:child_process';
import { PLATFORM } from './helpers';

/** Backend checkout used by E2E; override when the repositories are separate. */
const API_DIR = process.env.E2E_API_DIR ?? '../gastrohub-backend';

/** Fresh, seeded test database for every E2E run. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/_test\b/.test(url))
    throw new Error('TEST_DATABASE_URL must point to a *_test database.');
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' };
  const run = (command: string) => execSync(command, { cwd: API_DIR, stdio: 'inherit', env });
  run('npx prisma migrate deploy');
  run('npx tsx e2e-reset.ts');
  run('npx tsx prisma/seed.ts');
  // Test-only platform owner (local/CI test database).
  execSync(
    'npx tsx scripts/create-platform-admin.ts --email dono@plataforma-e2e.dev --name "Dono E2E"',
    {
      cwd: API_DIR,
      stdio: 'inherit',
      env: { ...env, PLATFORM_ADMIN_PASSWORD: PLATFORM.password },
    },
  );
}

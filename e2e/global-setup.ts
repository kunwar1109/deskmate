import { execSync } from 'node:child_process';

/**
 * Runs once before all tests: creates the E2E database's indexes (first run only) and empties it.
 * Uses the API's own scripts, so the E2E database is set up exactly like the real one.
 */
export default function globalSetup() {
  execSync('npm run e2e:prepare -w apps/api', {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, MONGODB_DB: 'deskmate_e2e' },
    stdio: 'inherit',
  });
}

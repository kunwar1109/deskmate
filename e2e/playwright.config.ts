import { defineConfig, devices } from '@playwright/test';
import { API_URL, SITE_URL, WEB_URL } from './urls';

/**
 * End-to-end tests: real processes, real browser. Playwright starts its own copy of the stack on separate
 * ports, against a separate database (deskmate_e2e) and queue prefix, so it never touches dev data:
 *
 *   API + widget.js  http://localhost:4100   (apps/api, plus the built widget it serves)
 *   worker           no port                  (ingestion jobs from the "e2e" queue prefix)
 *   dashboard        http://localhost:3100   (a production build of apps/web, rewrites pointed at :4100)
 *   shop site        http://127.0.0.1:4173   (a fake customer website that embeds the widget)
 *
 * MongoDB Atlas, Upstash Redis and Gemini are the real services from apps/api/.env.
 * Tests tagged @ai ask the chat model a question; `npm run test:e2e -- --grep-invert @ai` skips them.
 */
const ROOT = new URL('..', import.meta.url).pathname;

const apiEnv = {
  PORT: '4100',
  PUBLIC_URL: API_URL,
  MONGODB_DB: 'deskmate_e2e',
  QUEUE_PREFIX: 'e2e',
  // Lets each test claim its own client IP via X-Forwarded-For (see fixtures.ts), so per-IP rate limits
  // don't carry over between tests and runs. The dev API keeps 0: there, clients can't pick their IP.
  TRUST_PROXY_HOPS: '1',
  // Test runs don't report to Sentry (some tests fail on purpose while being written; Playwright keeps the traces).
  SENTRY_DSN: '',
};

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // One test at a time: the tests share Gemini's free-tier quota and one worker process.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure', // a failed test keeps a full recording: DOM snapshots, network, console
    screenshot: 'only-on-failure',
  },
  projects: [
    // Uploads the sample help center once into a shared workspace, for the tests that ask questions.
    { name: 'setup', testMatch: /shared\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: [
    {
      name: 'api',
      command: 'npm run build:widget && npm run start -w apps/api',
      cwd: ROOT,
      url: `${API_URL}/health`,
      env: apiEnv,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: 'worker',
      command: 'npm run start:worker -w apps/api', // no url: nothing to wait for, it just polls the queue
      cwd: ROOT,
      env: apiEnv,
    },
    {
      name: 'dashboard',
      // Rewrites are fixed at build time, so this build points /api/* at the E2E API. Built into .next-e2e.
      command: 'npx next build && npx next start --port 3100',
      cwd: `${ROOT}apps/web`,
      url: `${WEB_URL}/login`,
      env: { API_URL, NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_SENTRY_DSN: '' }, // no Sentry reports from test runs
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: 'shop',
      command: 'node shop-site.mjs',
      cwd: `${ROOT}e2e`,
      url: SITE_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

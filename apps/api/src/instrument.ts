/**
 * Sentry error tracking for the API and the worker. Loaded before the app itself
 * (`tsx --import ./src/instrument.ts src/index.ts`, see package.json): the SDK hooks into http, Express and
 * MongoDB as they load, and it can only do that if it starts first. Without SENTRY_DSN (tests, CI, a dev
 * setup without Sentry) nothing is initialised and every Sentry call is a no-op.
 */
import * as Sentry from '@sentry/node';
import { env } from './config.js';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [
      // Sentry would capture Express errors at the throw, before our error handler runs, and report a
      // ZodError (which we answer with 400) as a crash. We report from the error handler instead, where we
      // know which errors really become a 500 (see lib/monitoring.ts).
      Sentry.expressIntegration({ shouldHandleError: false }),
    ],
    // Allowlist, not the SDK's defaults. Sentry is a third party, and this API carries other businesses'
    // customer conversations: request bodies, AI inputs/outputs and local variables can all hold a
    // customer's message or email. Errors keep their message, stack trace, route and these few headers.
    dataCollection: {
      userInfo: false,
      cookies: false, // the session cookie
      httpHeaders: { request: { allow: ['content-type', 'user-agent', 'origin'] }, response: false },
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  });
}

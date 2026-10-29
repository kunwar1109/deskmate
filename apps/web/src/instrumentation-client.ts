// Runs in the browser before the dashboard's own code (a Next.js convention), so errors from the very first
// render are caught too. Uncaught errors and unhandled promise rejections are reported automatically.
// Errors only: no session replay (it records what people see, and adds ~50 KB) and no performance tracing
// (response times are measured by the API itself, see the Overview page).
import * as Sentry from "@sentry/nextjs";
import { dataCollection, SENTRY_DSN } from "@/lib/sentry";

if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, environment: process.env.NODE_ENV, dataCollection });
}

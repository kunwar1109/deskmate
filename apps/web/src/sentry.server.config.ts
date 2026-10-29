// Sentry for the dashboard's server side (Server Components, the proxy, route handlers). Loaded by
// instrumentation.ts when the Next.js server starts.
import * as Sentry from "@sentry/nextjs";
import { dataCollection, SENTRY_DSN } from "@/lib/sentry";

if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, environment: process.env.NODE_ENV, dataCollection });
}

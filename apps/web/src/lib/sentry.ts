import type { BrowserOptions } from "@sentry/nextjs";

/**
 * Shared by the browser (instrumentation-client.ts) and the server (sentry.server.config.ts).
 * NEXT_PUBLIC_ means Next copies the value into the browser bundle at build time: fine for a DSN, which only
 * lets someone send errors in. Empty or missing turns Sentry off (local without Sentry, CI, the E2E build).
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/**
 * Allowlist of what leaves for Sentry, a third party. The dashboard shows other businesses' customer chats,
 * so no request or response bodies (messages), no cookies (the session), no local variable values in stack
 * traces, and no automatic user details. Errors keep their message, stack trace and URL.
 */
export const dataCollection: BrowserOptions["dataCollection"] = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["content-type", "user-agent"] }, response: false },
  httpBodies: [],
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
};

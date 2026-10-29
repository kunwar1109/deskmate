import * as Sentry from "@sentry/nextjs";

/**
 * Next.js calls register() once when the server starts. Only the Node.js runtime is set up: in Next 16 the
 * proxy (proxy.ts) runs on Node.js too, so this app has no edge-runtime code to instrument.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
}

// Next.js calls this for errors thrown while rendering on the server (Server Components, route handlers).
// The browser only ever sees a digest; Sentry gets the real error and stack.
export const onRequestError = Sentry.captureRequestError;

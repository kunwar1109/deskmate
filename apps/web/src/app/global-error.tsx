"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last resort: an error in the root layout itself, which no other error page can catch. It replaces the whole
 * page, so it renders its own <html> and <body>. Errors caught by an error boundary never reach the global
 * handlers Sentry listens to, so they're reported here by hand.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>The error was reported. Reload the page to try again.</p>
      </body>
    </html>
  );
}

"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Shown instead of a crash when a dashboard page throws, e.g. the API is down. An error boundary "catches"
// the error, so it never reaches the global handlers Sentry listens to: report it here.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="space-y-3 py-12 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading your dashboard</h1>
      <p className="text-muted-foreground">The Deskmate API may be offline. Check that it&apos;s running, then try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";

// Shown instead of a crash when a dashboard page throws, e.g. the API is down.
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3 py-12 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading your dashboard</h1>
      <p className="text-muted-foreground">The Deskmate API may be offline. Check that it&apos;s running, then try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

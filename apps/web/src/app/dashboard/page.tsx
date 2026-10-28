import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard · Deskmate" };

export default function DashboardPage() {
  return (
    <div className="space-y-2">
      <Suspense fallback={<h1 className="h-8 w-64 animate-pulse rounded-md bg-muted" />}>
        <Welcome />
      </Suspense>
      <p className="text-muted-foreground">Your documents and the test chat will appear here.</p>
    </div>
  );
}

async function Welcome() {
  const { user, workspace } = await getCurrentUser();
  return (
    <h1 className="text-2xl font-semibold">
      Welcome, {user.name}. This is the {workspace.name} workspace.
    </h1>
  );
}

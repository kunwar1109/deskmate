import type { Metadata } from "next";
import { Suspense } from "react";
import { Playground } from "@/components/playground/playground";

export const metadata: Metadata = { title: "Test chat · Deskmate" };

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Test chat</h1>
        <p className="text-muted-foreground">
          Chat the way your customers would. Watch each step the agent takes, which passages it used and how closely
          they matched, and why it handed off when it did.
        </p>
      </div>
      {/* Playground reads ?c= from the URL, which is only known at request time, so it renders inside Suspense. */}
      <Suspense fallback={<p className="py-10 text-muted-foreground">Loading…</p>}>
        <Playground />
      </Suspense>
    </div>
  );
}

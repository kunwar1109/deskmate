import type { Metadata } from "next";
import { Playground } from "@/components/playground/playground";

export const metadata: Metadata = { title: "Test chat · Deskmate" };

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Test chat</h1>
        <p className="text-muted-foreground">
          Ask what your customers would ask. See which passages the bot used, how closely they matched, and why it
          handed off when it did.
        </p>
      </div>
      <Playground />
    </div>
  );
}

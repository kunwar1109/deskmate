import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/inbox/inbox";

export const metadata: Metadata = { title: "Inbox · Deskmate" };

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-muted-foreground">
          Customer chats from your website. When the bot hands off, the chat lands here and you can take over live.
        </p>
      </div>
      {/* Inbox reads ?c= (the open chat) from the URL, which is only known at request time. */}
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Inbox />
      </Suspense>
    </div>
  );
}

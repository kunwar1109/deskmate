import type { Metadata } from "next";
import { ApiKeysPanel } from "@/components/api-keys/api-keys-panel";

export const metadata: Metadata = { title: "API keys · Deskmate" };

export default function ApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-muted-foreground">Let AI tools like Claude or Cursor search your help docs.</p>
      </div>
      <ApiKeysPanel />
    </div>
  );
}

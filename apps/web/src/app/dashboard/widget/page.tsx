import type { Metadata } from "next";
import { WidgetSettingsPanel } from "@/components/widget/widget-settings";

export const metadata: Metadata = { title: "Widget · Deskmate" };

export default function WidgetPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Widget</h1>
        <p className="text-muted-foreground">Put the support chat on your website with one line of code.</p>
      </div>
      <WidgetSettingsPanel />
    </div>
  );
}

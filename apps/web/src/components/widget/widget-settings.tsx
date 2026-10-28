"use client";

import { AllowedOriginsBody, type WidgetSettings } from "@deskmate/shared/widget";
import { CheckIcon, CopyIcon, Loader2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { embedSnippet, useRotateWidgetKey, useUpdateAllowedOrigins, useWidgetSettings } from "@/lib/widget";

export function WidgetSettingsPanel() {
  const { data: settings, isPending, error } = useWidgetSettings();

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  return (
    <div className="space-y-6">
      <InstallCard settings={settings} />
      {/* key: the form starts from the saved list again whenever it changes on the server */}
      <AllowedOriginsCard key={settings.allowedOrigins.join("\n")} settings={settings} />
      <RotateKeyCard settings={settings} />
    </div>
  );
}

function InstallCard({ settings }: { settings: WidgetSettings }) {
  const [copied, setCopied] = useState(false);
  const snippet = embedSnippet(settings);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Snippet copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add the chat to your website</CardTitle>
        <CardDescription>
          Paste this line just before <code>&lt;/body&gt;</code> on every page where customers should see the chat
          button. The widget answers from your documents and hands off to your team when it can&apos;t.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
          <code>{snippet}</code>
        </pre>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy snippet"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function AllowedOriginsCard({ settings }: { settings: WidgetSettings }) {
  const [value, setValue] = useState(settings.allowedOrigins.join("\n"));
  const [formError, setFormError] = useState<string | null>(null);
  const update = useUpdateAllowedOrigins();

  function save() {
    const allowedOrigins = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    // Same rules as the API: full origins like https://shop.example.com, no paths.
    const parsed = AllowedOriginsBody.safeParse({ allowedOrigins });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the list");
      return;
    }
    setFormError(null);
    update.mutate(parsed.data, {
      onSuccess: () => toast.success("Allowed websites saved"),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allowed websites</CardTitle>
        <CardDescription>
          Only these sites can show your widget, so nobody can put it on their own site and use up your AI quota.
          One per line, like <code>https://shop.example.com</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.allowedOrigins.length === 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
            Any website can use your widget right now. Add your own domains to lock it down.
          </p>
        )}
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          placeholder={"https://shop.example.com\nhttp://localhost:5173"}
          aria-label="Allowed websites, one per line"
          aria-invalid={formError !== null}
          className="font-mono text-sm"
        />
        {formError && <p className="text-sm text-destructive">{formError}</p>}
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending && <Loader2Icon className="animate-spin" />} Save
        </Button>
      </CardFooter>
    </Card>
  );
}

function RotateKeyCard({ settings }: { settings: WidgetSettings }) {
  const rotate = useRotateWidgetKey();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget key</CardTitle>
        <CardDescription>
          The key is public (it&apos;s in your page source). If someone copied it onto a site you don&apos;t control,
          get a new one: the old key stops working immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <code className="rounded bg-muted px-2 py-1 text-sm">{settings.key}</code>
      </CardContent>
      <CardFooter>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={rotate.isPending}>
              <RefreshCwIcon /> Get a new key
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace the widget key?</AlertDialogTitle>
              <AlertDialogDescription>
                The chat disappears from your website until you paste the new snippet there. Visitors will start new
                chats.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  rotate.mutate(undefined, {
                    onSuccess: () => toast.success("New key ready. Update the snippet on your site."),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                Replace key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

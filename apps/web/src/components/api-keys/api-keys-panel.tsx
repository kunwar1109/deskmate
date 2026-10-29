"use client";

import { CreateApiKeyBody, type ApiKeySummary, type CreatedApiKey } from "@deskmate/shared/api-keys";
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { clientSetup, useApiKeys, useCreateApiKey, useDeleteApiKey } from "@/lib/api-keys";
import { timeAgo } from "@/lib/inbox";

export function ApiKeysPanel() {
  const { data, isPending, error } = useApiKeys();

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  return (
    <div className="space-y-6">
      <KeysCard keys={data.keys} />
      <SetupCard mcpUrl={data.mcpUrl} />
    </div>
  );
}

function KeysCard({ keys }: { keys: ApiKeySummary[] }) {
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null); // the full key lives only here, in memory
  const create = useCreateApiKey();

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateApiKeyBody.safeParse({ name });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the name");
      return;
    }
    setFormError(null);
    create.mutate(parsed.data, {
      onSuccess: (key) => {
        setCreated(key);
        setName("");
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          A key lets an AI tool search this workspace&apos;s documents. It can&apos;t change anything or read chats. Use one
          key per tool or person, so you can turn one off without breaking the others.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {created && <NewKey created={created} onDone={() => setCreated(null)} />}

        <form onSubmit={submit} className="flex flex-wrap items-start gap-2" noValidate>
          <div className="min-w-56 flex-1 space-y-1">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Cursor on my laptop"
              aria-label="Key name"
              aria-invalid={formError !== null}
            />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} Create key
          </Button>
        </form>

        {keys.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{key.prefix}…</TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(key.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{key.lastUsedAt ? timeAgo(key.lastUsedAt) : "Never"}</TableCell>
                  <TableCell>
                    <DeleteKeyButton apiKey={key} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** The one moment the full key is visible. After "Done" (or a reload) it's gone: only its hash is stored. */
function NewKey({ created, onDone }: { created: CreatedApiKey; onDone: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950" role="status">
      <p className="font-medium">Copy your new key now: you won&apos;t see it again.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-sm" aria-label="New API key">
          {created.key}
        </code>
        <CopyButton text={created.key} label="Copy key" />
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
      <p className="text-sm">Treat it like a password. If it leaks, delete it below and create a new one.</p>
    </div>
  );
}

function DeleteKeyButton({ apiKey }: { apiKey: ApiKeySummary }) {
  const remove = useDeleteApiKey();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${apiKey.name}`} disabled={remove.isPending}>
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{apiKey.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Tools using this key lose access immediately. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              remove.mutate(apiKey.id, {
                onSuccess: () => toast.success(`Deleted ${apiKey.name}`),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SetupCard({ mcpUrl }: { mcpUrl: string }) {
  const setup = clientSetup(mcpUrl);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect an AI tool</CardTitle>
        <CardDescription>
          Deskmate is an MCP server (Model Context Protocol, the standard way AI tools call outside services). Put your
          key in an environment variable named <code>DESKMATE_API_KEY</code>, then add the server:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Snippet title="Claude Code" text={setup.claudeCode} />
        <Snippet title="Cursor: .cursor/mcp.json" text={setup.cursor} />
        <p className="text-sm text-muted-foreground">
          Other clients: server URL <code>{mcpUrl}</code>, header <code>Authorization: Bearer &lt;key&gt;</code>. It
          offers one tool, <code>search_knowledge_base</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function Snippet({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <CopyButton text={text} label={`Copy ${title} setup`} />
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} aria-label={label}>
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}

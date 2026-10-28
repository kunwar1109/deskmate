"use client";

import type { DocumentStatus, DocumentSummary } from "@deskmate/shared/documents";
import { FileTextIcon, Loader2Icon, Trash2Icon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { useDeleteDocument, useDocuments } from "@/lib/documents";

export function DocumentsTable() {
  const { data: documents, isPending, isError, error, refetch } = useDocuments();

  if (isPending) {
    return (
      <div className="space-y-2" aria-label="Loading documents">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-2 rounded-lg border p-6 text-center">
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-muted-foreground">
        <FileTextIcon className="mx-auto mb-2 size-8" aria-hidden />
        No documents yet. Upload your help center, FAQ or policies above.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Chunks</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="max-w-xs">
              <p className="truncate font-medium">{doc.title}</p>
              {doc.status === "failed" && doc.error && <p className="text-sm whitespace-normal text-destructive">{doc.error}</p>}
            </TableCell>
            <TableCell aria-live="polite">
              <StatusBadge status={doc.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{doc.status === "ready" ? doc.chunkCount : "–"}</TableCell>
            <TableCell className="text-muted-foreground">
              <time dateTime={doc.createdAt}>{formatDate(doc.createdAt)}</time>
            </TableCell>
            <TableCell>
              <DeleteButton doc={doc} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const STATUS: Record<DocumentStatus, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  processing: { label: "Processing", variant: "outline" },
  ready: { label: "Ready", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, variant } = STATUS[status];
  return (
    <Badge variant={variant}>
      {status === "processing" && <Loader2Icon className="animate-spin" aria-hidden />}
      {label}
    </Badge>
  );
}

function DeleteButton({ doc }: { doc: DocumentSummary }) {
  const remove = useDeleteDocument();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${doc.title}`} disabled={remove.isPending}>
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The bot will stop using it to answer questions. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              remove.mutate(doc.id, {
                onSuccess: () => toast.success(`Deleted ${doc.title}`),
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

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

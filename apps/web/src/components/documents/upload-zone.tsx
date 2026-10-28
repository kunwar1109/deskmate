"use client";

import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from "@deskmate/shared/documents";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { formatBytes, useUploadDocument, validateFile } from "@/lib/documents";
import { cn } from "@/lib/utils";

export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadDocument();

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    // One at a time: the worker processes them one at a time anyway, and the toasts stay readable.
    for (const file of Array.from(files)) {
      const problem = validateFile(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      try {
        await upload.mutateAsync(file);
        toast.success(`${file.name} uploaded. Processing…`);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      }
    }
    if (inputRef.current) inputRef.current.value = ""; // allow picking the same file again
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="sr-only"
        id="document-upload"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <label htmlFor="document-upload" className="flex cursor-pointer flex-col items-center gap-2">
        {upload.isPending ? (
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <UploadIcon className="size-8 text-muted-foreground" aria-hidden />
        )}
        <span className="font-medium">{upload.isPending ? "Uploading…" : "Drop files here or click to upload"}</span>
        <span className="text-sm text-muted-foreground">
          PDF, Markdown or text, up to {formatBytes(MAX_UPLOAD_BYTES)} each
        </span>
      </label>
    </div>
  );
}

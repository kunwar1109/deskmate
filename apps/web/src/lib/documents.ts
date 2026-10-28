import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, type DocumentSummary } from "@deskmate/shared/documents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const documentsKey = ["documents"] as const;

export function useDocuments() {
  return useQuery({
    queryKey: documentsKey,
    queryFn: () => apiFetch<DocumentSummary[]>("/documents"),
    // Poll every 2s only while something is still processing; stop once everything is ready or failed.
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === "processing") ? 2000 : false),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("title", titleFromFilename(file.name));
      form.append("file", file);
      // No Content-Type header: the browser sets multipart/form-data with the right boundary itself.
      return apiFetch<DocumentSummary>("/documents", { method: "POST", body: form });
    },
    onSuccess: (doc) => {
      // Show the new row right away (status "processing"), which also switches polling on.
      queryClient.setQueryData<DocumentSummary[]>(documentsKey, (old) => [doc, ...(old ?? [])]);
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DocumentSummary[]>(documentsKey, (old) => old?.filter((d) => d.id !== id));
    },
  });
}

/** Same rules the API enforces, checked before uploading so the user doesn't wait for a rejection. */
export function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `${file.name}: only ${ACCEPTED_EXTENSIONS.join(", ")} files are supported.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, ""); // "refund-policy.pdf" -> "refund-policy"
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

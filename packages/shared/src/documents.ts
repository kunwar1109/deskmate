// Upload rules, shared so the dashboard can reject a wrong file before uploading it.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const PDF_EXTENSIONS = ['.pdf'];
export const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];
export const ACCEPTED_EXTENSIONS = [...PDF_EXTENSIONS, ...TEXT_EXTENSIONS];

export type SourceType = 'pdf' | 'text';
export type DocumentStatus = 'processing' | 'ready' | 'failed';

/** A document as the API returns it. Dates are ISO strings because that's what JSON carries. */
export interface DocumentSummary {
  id: string;
  title: string;
  sourceType: SourceType;
  status: DocumentStatus;
  chunkCount: number;
  error?: string; // set when status is "failed"
  createdAt: string;
  updatedAt: string;
}

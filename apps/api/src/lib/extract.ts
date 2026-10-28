import { PDF_EXTENSIONS, TEXT_EXTENSIONS, type SourceType } from '@deskmate/shared/documents';
import { extractText } from 'unpdf';

export class UnsupportedFileError extends Error {}

export interface ExtractedDocument {
  pages: string[];
  paged: boolean;
}

/** Cheap check that runs in the upload request, so the user hears "unsupported file" right away. */
export function detectSourceType(file: { mimetype: string; originalname: string }): SourceType {
  const name = file.originalname.toLowerCase();
  if (file.mimetype === 'application/pdf' || PDF_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'pdf';
  if (file.mimetype.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'text';
  throw new UnsupportedFileError(`Unsupported file type: ${file.mimetype || name}. Upload a PDF, .txt or .md file.`);
}

/** The slow part (parsing a PDF), run by the worker. */
export async function extractPages(buffer: Buffer, sourceType: SourceType): Promise<ExtractedDocument> {
  if (sourceType === 'pdf') {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: false });
    return { pages: text, paged: true };
  }
  return { pages: [buffer.toString('utf8')], paged: false };
}

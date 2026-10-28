import { extractText } from 'unpdf';

export class UnsupportedFileError extends Error {}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface ExtractedDocument {
  sourceType: 'pdf' | 'text';
  pages: string[];
  paged: boolean;
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];

export async function extractFromFile(file: UploadedFile): Promise<ExtractedDocument> {
  const name = file.originalname.toLowerCase();

  if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
    const { text } = await extractText(new Uint8Array(file.buffer), { mergePages: false });
    return { sourceType: 'pdf', pages: text, paged: true };
  }

  if (file.mimetype.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return { sourceType: 'text', pages: [file.buffer.toString('utf8')], paged: false };
  }

  throw new UnsupportedFileError(`Unsupported file type: ${file.mimetype || name}. Upload a PDF, .txt or .md file.`);
}

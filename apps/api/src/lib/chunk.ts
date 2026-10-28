/**
 * Recursive text splitter.
 *
 * Why: embeddings work best on focused passages. A whole manual in one vector blurs every topic together;
 * a single sentence loses its context. ~1000 characters (roughly 200-250 tokens) is a common middle ground.
 *
 * How: try to split on the biggest natural boundary first (paragraphs), and only fall back to smaller ones
 * (lines, sentences, words) when a piece is still too long. Then glue small pieces back together up to the
 * size limit, carrying a short overlap so a fact that straddles two chunks is still findable.
 */

export interface TextChunk {
  index: number;
  text: string;
  page?: number;
}

const SEPARATORS = ['\n\n', '\n', '. ', ' '];

export function splitText(input: string, maxChars = 1000, overlap = 150): string[] {
  const text = normalize(input);
  if (!text) return [];

  const pieces = splitRecursive(text, maxChars, 0);

  const result: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length > maxChars) {
      result.push(current.trim());
      current = overlapTail(current, overlap) + piece;
    } else {
      current += piece;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/** Chunk a list of pages, keeping page numbers so citations can say "page 4". */
export function chunkPages(pages: string[], { paged }: { paged: boolean }): TextChunk[] {
  const out: TextChunk[] = [];
  pages.forEach((pageText, i) => {
    for (const text of splitText(pageText)) {
      out.push({ index: out.length, text, ...(paged ? { page: i + 1 } : {}) });
    }
  });
  return out;
}

function splitRecursive(text: string, maxChars: number, level: number): string[] {
  if (text.length <= maxChars) return [text];

  const separator = SEPARATORS[level];
  if (separator === undefined) {
    // No natural boundary left (e.g. one enormous token): hard cut.
    const cuts: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) cuts.push(text.slice(i, i + maxChars));
    return cuts;
  }

  const parts = text.split(separator);
  return parts.flatMap((part, i) => {
    const withSeparator = i < parts.length - 1 ? part + separator : part;
    return withSeparator.length > maxChars
      ? splitRecursive(withSeparator, maxChars, level + 1)
      : [withSeparator];
  });
}

function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0) return '';
  const tail = text.slice(-overlap);
  const firstSpace = tail.indexOf(' ');
  return firstSpace === -1 ? tail : tail.slice(firstSpace + 1); // start on a word boundary
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

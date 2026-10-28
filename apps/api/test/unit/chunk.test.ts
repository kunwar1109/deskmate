import { describe, expect, it } from '@jest/globals';
import { chunkPages, splitText } from '../../src/lib/chunk.js';

describe('splitText', () => {
  it('keeps short text as one chunk', () => {
    expect(splitText('Shipping is free within India.')).toEqual(['Shipping is free within India.']);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitText('   \n\n  ')).toEqual([]);
  });

  it('never makes a chunk longer than the limit (plus the overlap carried in)', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'word '.repeat(40)}`).join('\n\n');
    const chunks = splitText(paragraphs, 1000, 150);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1000 + 150);
  });

  it('prefers paragraph boundaries over cutting mid-paragraph', () => {
    const a = 'A'.repeat(600);
    const b = 'B'.repeat(600);
    const [first, second] = splitText(`${a}\n\n${b}`, 1000, 0);
    expect(first).toBe(a);
    expect(second).toBe(b);
  });

  it('repeats the end of one chunk at the start of the next (overlap)', () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const [first, second] = splitText(sentences, 300, 80);
    const tail = first!.slice(-40);
    expect(second!.includes(tail.slice(tail.indexOf(' ') + 1))).toBe(true);
  });

  it('hard-cuts a single enormous token instead of looping forever', () => {
    const chunks = splitText('x'.repeat(2500), 1000, 0);
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500]);
  });
});

describe('chunkPages', () => {
  it('numbers chunks across pages and keeps page numbers for PDFs', () => {
    const chunks = chunkPages(['Page one text.', 'Page two text.'], { paged: true });
    expect(chunks).toEqual([
      { index: 0, text: 'Page one text.', page: 1 },
      { index: 1, text: 'Page two text.', page: 2 },
    ]);
  });

  it('leaves out page numbers for text files', () => {
    expect(chunkPages(['Just text.'], { paged: false })).toEqual([{ index: 0, text: 'Just text.' }]);
  });
});

import { UnrecoverableError } from 'bullmq';
import type { ObjectId } from 'mongodb';
import { chunks, documents, type ChunkRecord } from '../db.js';
import { chunkPages } from './chunk.js';
import { embedDocuments } from './embed.js';
import { extractPages } from './extract.js';
import { readFile } from './files.js';
import { waitUntilSearchable } from './retrieve.js';

/**
 * Ingestion pipeline, run by the worker: read file -> extract text -> chunk -> embed -> store -> wait until searchable.
 *
 * Safe to run more than once for the same document, because BullMQ retries failed jobs:
 * it replaces chunks a previous attempt left behind instead of adding duplicates.
 */
export async function ingestDocument(documentId: ObjectId): Promise<{ chunkCount: number }> {
  const doc = await documents.findOne({ _id: documentId });
  if (!doc) return { chunkCount: 0 }; // deleted before the worker got to it

  const { pages, paged } = await extractPages(await readFile(documentId), doc.sourceType);
  const pieces = chunkPages(pages, { paged });
  if (pieces.length === 0) {
    // Retrying won't make a scanned PDF readable, so tell BullMQ not to bother.
    throw new UnrecoverableError('No readable text found. Scanned PDFs need OCR, which is not supported yet.');
  }

  const embeddings = await embedDocuments(pieces.map((p) => p.text));

  const now = new Date();
  const records: ChunkRecord[] = pieces.map((p, i) => ({
    workspaceId: doc.workspaceId,
    documentId,
    documentTitle: doc.title,
    index: p.index,
    ...(p.page !== undefined ? { page: p.page } : {}),
    text: p.text,
    embedding: embeddings[i]!,
    createdAt: now,
  }));
  await chunks.deleteMany({ documentId });
  await chunks.insertMany(records);
  await waitUntilSearchable(documentId, records.length, records[0]!.embedding);

  const { matchedCount } = await documents.updateOne(
    { _id: documentId },
    { $set: { status: 'ready', chunkCount: records.length, updatedAt: new Date() }, $unset: { error: '' } },
  );
  // The user deleted the document while we were embedding it: don't leave orphan chunks behind.
  if (matchedCount === 0) await chunks.deleteMany({ documentId });

  return { chunkCount: records.length };
}

/** Called once a job has used up its retries. Records why, so the dashboard can show it. */
export async function markFailed(documentId: ObjectId, message: string): Promise<void> {
  await chunks.deleteMany({ documentId });
  await documents.updateOne({ _id: documentId }, { $set: { status: 'failed', error: message, updatedAt: new Date() } });
}

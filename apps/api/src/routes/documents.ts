import { Router } from 'express';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { chunkPages } from '../lib/chunk.js';
import { embedDocuments } from '../lib/embed.js';
import { extractFromFile } from '../lib/extract.js';
import { getWorkspaceId } from '../lib/workspace.js';
import { chunks, documents, type ChunkRecord } from '../db.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const documentsRouter = Router();

/**
 * Ingestion pipeline: extract text -> chunk -> embed -> store.
 * Phase 1 runs it inside the request. Phase 2 moves it to a background queue (BullMQ),
 * because a 200-page PDF can take longer than an HTTP request should stay open.
 */
documentsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Attach a file in the "file" field.' });
    return;
  }

  const workspaceId = getWorkspaceId(req);
  const now = new Date();
  const title = (typeof req.body?.title === 'string' && req.body.title.trim()) || req.file.originalname;

  // Validate the file type before creating any records.
  const extracted = await extractFromFile(req.file);

  const { insertedId: documentId } = await documents.insertOne({
    workspaceId,
    title,
    sourceType: extracted.sourceType,
    status: 'processing',
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const pieces = chunkPages(extracted.pages, { paged: extracted.paged });
    if (pieces.length === 0) throw new Error('No readable text found. Scanned PDFs need OCR, which is not supported yet.');

    const embeddings = await embedDocuments(pieces.map((p) => p.text));

    const records: ChunkRecord[] = pieces.map((p, i) => ({
      workspaceId,
      documentId,
      documentTitle: title,
      index: p.index,
      ...(p.page !== undefined ? { page: p.page } : {}),
      text: p.text,
      embedding: embeddings[i]!,
      createdAt: now,
    }));
    await chunks.insertMany(records);

    await documents.updateOne(
      { _id: documentId },
      { $set: { status: 'ready', chunkCount: records.length, updatedAt: new Date() } },
    );

    res.status(201).json({ id: documentId, title, status: 'ready', chunkCount: records.length });
  } catch (err) {
    // Leave no half-ingested data behind, and record why it failed for the dashboard.
    await chunks.deleteMany({ documentId });
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    await documents.updateOne({ _id: documentId }, { $set: { status: 'failed', error: message, updatedAt: new Date() } });
    res.status(422).json({ id: documentId, status: 'failed', error: message });
  }
});

documentsRouter.get('/', async (req, res) => {
  const list = await documents
    .find({ workspaceId: getWorkspaceId(req) })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(list);
});

documentsRouter.delete('/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: 'Invalid document id' });
    return;
  }
  const _id = new ObjectId(req.params.id);
  const workspaceId = getWorkspaceId(req);

  // Filtering by workspaceId as well as _id means nobody can delete another workspace's document by guessing ids.
  const { deletedCount } = await documents.deleteOne({ _id, workspaceId });
  if (deletedCount === 0) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  await chunks.deleteMany({ documentId: _id, workspaceId });
  res.status(204).end();
});

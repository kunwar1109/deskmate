import { Router } from 'express';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { HttpError } from '../lib/errors.js';
import { detectSourceType } from '../lib/extract.js';
import { deleteFile, saveFile } from '../lib/files.js';
import { getWorkspaceId } from '../lib/workspace.js';
import { chunks, documents } from '../db.js';
import { ingestQueue } from '../queue.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const documentsRouter = Router();

function parseId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, 'Invalid document id');
  return new ObjectId(id);
}

/**
 * Upload: store the file and queue it. The slow work (extract, chunk, embed) happens in the worker,
 * so this responds in well under a second even for a 200-page PDF.
 */
documentsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Attach a file in the "file" field.' });
    return;
  }

  const workspaceId = getWorkspaceId(req);
  const now = new Date();
  const title = (typeof req.body?.title === 'string' && req.body.title.trim()) || req.file.originalname;

  // Reject unsupported types now, while the user is still waiting for a response.
  const sourceType = detectSourceType(req.file);

  const { insertedId: documentId } = await documents.insertOne({
    workspaceId,
    title,
    sourceType,
    status: 'processing',
    chunkCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await saveFile(documentId, req.file.originalname, req.file.buffer);
    // jobId = documentId, so the same document can never be queued twice.
    await ingestQueue.add('ingest', { documentId: documentId.toString() }, { jobId: documentId.toString() });
  } catch (err) {
    // Couldn't hand it to the worker (e.g. Redis is down). Undo, so nothing sits in "processing" forever.
    await Promise.all([documents.deleteOne({ _id: documentId }), deleteFile(documentId)]);
    throw err;
  }

  // 202 Accepted = "received, still working on it". Poll GET /:id until status is "ready" or "failed".
  res.status(202).json({ id: documentId, title, status: 'processing' });
});

documentsRouter.get('/', async (req, res) => {
  const list = await documents
    .find({ workspaceId: getWorkspaceId(req) })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(list);
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await documents.findOne({ _id: parseId(req.params.id), workspaceId: getWorkspaceId(req) });
  if (!doc) throw new HttpError(404, 'Document not found');
  res.json(doc);
});

documentsRouter.delete('/:id', async (req, res) => {
  const _id = parseId(req.params.id);
  const workspaceId = getWorkspaceId(req);

  // Filtering by workspaceId as well as _id means nobody can delete another workspace's document by guessing ids.
  const { deletedCount } = await documents.deleteOne({ _id, workspaceId });
  if (deletedCount === 0) throw new HttpError(404, 'Document not found');

  await Promise.all([
    chunks.deleteMany({ documentId: _id, workspaceId }),
    deleteFile(_id),
    // Drop the job if it hasn't started. If it's running right now, remove() can't touch it,
    // but the worker notices the document is gone when it finishes and cleans up its chunks.
    ingestQueue.remove(_id.toString()).catch(() => 0),
  ]);
  res.status(204).end();
});

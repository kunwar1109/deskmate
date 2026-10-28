import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GridFSBucket, type ObjectId } from 'mongodb';
import { db } from '../db.js';

/**
 * Original uploads are stored in MongoDB GridFS (big files split into 255 KB pieces), under the document's id.
 * Why store them at all: the worker is a separate process and needs the bytes, and keeping originals means we
 * can re-index later (new chunk size or embedding model) without asking customers to upload again.
 * In production this would usually be object storage like S3; GridFS keeps the free-tier setup to one database.
 */
const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

export async function saveFile(id: ObjectId, filename: string, buffer: Buffer): Promise<void> {
  await pipeline(Readable.from(buffer), bucket.openUploadStreamWithId(id, filename));
}

export async function readFile(id: ObjectId): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of bucket.openDownloadStream(id)) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

export async function deleteFile(id: ObjectId): Promise<void> {
  // bucket.delete throws if the file doesn't exist, e.g. the upload failed before saving it.
  const exists = await bucket.find({ _id: id }).limit(1).hasNext();
  if (exists) await bucket.delete(id);
}

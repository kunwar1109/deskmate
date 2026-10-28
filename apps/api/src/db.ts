import { MongoClient, type ObjectId } from 'mongodb';
import { env } from './config.js';

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentRecord {
  _id?: ObjectId;
  workspaceId: string;
  title: string;
  sourceType: 'pdf' | 'text';
  status: DocumentStatus;
  chunkCount: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChunkRecord {
  _id?: ObjectId;
  workspaceId: string; // duplicated from the document so vector search can filter by tenant
  documentId: ObjectId;
  documentTitle: string; // duplicated so citations need no extra lookup
  index: number;
  page?: number;
  text: string;
  embedding: number[];
  createdAt: Date;
}

const client = new MongoClient(env.MONGODB_URI);

export const db = client.db(env.MONGODB_DB);
export const documents = db.collection<DocumentRecord>('documents');
export const chunks = db.collection<ChunkRecord>('chunks');

export async function connectDb() {
  await client.connect();
  await db.command({ ping: 1 });
}

export async function closeDb() {
  await client.close();
}

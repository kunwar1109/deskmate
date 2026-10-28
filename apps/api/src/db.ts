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

export interface UserRecord {
  _id?: ObjectId;
  email: string; // stored lowercased; unique index
  name: string;
  passwordHash: string; // argon2id hash, never the password itself
  createdAt: Date;
}

export interface WorkspaceRecord {
  _id?: ObjectId;
  name: string;
  createdAt: Date;
}

// Separate collection (not an array on the user) so a workspace can later have many members
// and a user many workspaces, without unbounded arrays inside documents.
export interface MembershipRecord {
  _id?: ObjectId;
  userId: ObjectId;
  workspaceId: ObjectId;
  role: 'owner' | 'member';
  createdAt: Date;
}

export const client = new MongoClient(env.MONGODB_URI);

export const db = client.db(env.MONGODB_DB);
export const documents = db.collection<DocumentRecord>('documents');
export const chunks = db.collection<ChunkRecord>('chunks');
export const users = db.collection<UserRecord>('users');
export const workspaces = db.collection<WorkspaceRecord>('workspaces');
export const memberships = db.collection<MembershipRecord>('memberships');

export async function connectDb() {
  await client.connect();
  await db.command({ ping: 1 });
}

export async function closeDb() {
  await client.close();
}

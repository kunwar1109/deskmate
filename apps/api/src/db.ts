import type { ConversationStatus, DeskmateUIMessage, HandoffReason } from '@deskmate/shared/chat';
import type { DocumentStatus, SourceType } from '@deskmate/shared/documents';
import { MongoClient, type ObjectId } from 'mongodb';
import { env } from './config.js';

export interface DocumentRecord {
  _id?: ObjectId;
  workspaceId: string;
  title: string;
  sourceType: SourceType;
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
  // Created the first time the owner opens the widget settings.
  widget?: {
    key: string; // public (it's in the embed snippet), so stored as is; unique index
    allowedOrigins: string[]; // sites allowed to embed the widget; empty = any
  };
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

// Created by the agent's createTicket tool when a customer's problem needs follow-up.
export interface TicketRecord {
  _id?: ObjectId;
  workspaceId: string;
  number: string; // short, human-friendly, e.g. "T-4F7K2Q"
  subject: string;
  summary: string;
  customerEmail: string;
  status: 'open' | 'closed';
  createdAt: Date;
}

export interface ConversationRecord {
  _id?: ObjectId;
  workspaceId: string;
  channel: 'playground' | 'widget';
  status: ConversationStatus;
  // Widget chats only: SHA-256 of the visitor's token. The token itself is only ever in the visitor's browser.
  visitorTokenHash?: string;
  title: string;
  handoffReason?: HandoffReason;
  createdAt: Date;
  updatedAt: Date;
}

// One document per message (not an array on the conversation): a long chat can't hit Mongo's 16 MB
// document limit, and adding a message is an insert instead of rewriting the whole conversation.
export interface MessageRecord {
  _id?: ObjectId;
  workspaceId: string;
  conversationId: ObjectId;
  messageId: string; // the AI SDK's UIMessage id
  role: 'user' | 'assistant';
  parts: DeskmateUIMessage['parts']; // stored in the AI SDK's UI format, so it renders back as it streamed
  metadata?: DeskmateUIMessage['metadata'];
  createdAt: Date;
}

export const client = new MongoClient(env.MONGODB_URI);

export const db = client.db(env.MONGODB_DB);
export const documents = db.collection<DocumentRecord>('documents');
export const chunks = db.collection<ChunkRecord>('chunks');
export const users = db.collection<UserRecord>('users');
export const workspaces = db.collection<WorkspaceRecord>('workspaces');
export const memberships = db.collection<MembershipRecord>('memberships');
export const tickets = db.collection<TicketRecord>('tickets');
export const conversations = db.collection<ConversationRecord>('conversations');
export const messages = db.collection<MessageRecord>('messages');

export async function connectDb() {
  await client.connect();
  await db.command({ ping: 1 });
}

export async function closeDb() {
  await client.close();
}

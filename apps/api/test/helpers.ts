import { randomUUID } from 'node:crypto';
import type { DeskmateUIMessage } from '@deskmate/shared/chat';
import { jest } from '@jest/globals';
import { createUIMessageStream } from 'ai';
import type { Express } from 'express';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type { AgentReply } from '../src/lib/agent.js';
import type { RateLimitStore } from '../src/lib/rate-limit.js';

/** Fixed-window counter in memory: same behaviour as the Redis Lua script, for tests. */
export function memoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowSeconds) {
      const now = Date.now();
      let window = windows.get(key);
      if (!window || window.resetAt <= now) {
        window = { count: 0, resetAt: now + windowSeconds * 1000 };
        windows.set(key, window);
      }
      window.count += 1;
      return [window.count, Math.ceil((window.resetAt - now) / 1000)];
    },
  };
}

/**
 * The bot's reply in API tests. No Gemini call: it saves a canned answer with a search tool call
 * (including a similarity score, so tests can check the customer never sees it) and streams it.
 */
export const fakeReply = (): DeskmateUIMessage => ({
  id: `reply-${randomUUID()}`,
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    {
      type: 'tool-searchDocs',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: 'explorer price' },
      output: {
        found: true,
        bestScore: 0.91,
        passages: [{ n: 1, documentId: 'doc-1', title: 'Help Center', score: 0.91, text: 'Explorer costs ₹1,299.' }],
      },
    },
    { type: 'text', text: 'The Explorer plan costs ₹1,299 [1].' },
  ],
  metadata: { latencyMs: 5, usage: { inputTokens: 100, outputTokens: 10 }, topScore: 0.91 },
});

export const agentCalls: string[] = []; // the text of every customer message the fake agent answered

/** Every search the fake retrieval ran, to check which workspace a search was scoped to. */
export const retrieveCalls: { workspaceId: string; query: string; limit: number | undefined }[] = [];

/**
 * Stands in for Atlas Vector Search, which the in-memory MongoDB doesn't have. One strong match and one
 * below MIN_RELEVANCE (0.7), so tests can check that weak matches are filtered out. "fail" throws, like an
 * embedding call that Gemini refuses.
 */
async function fakeRetrieve(workspaceId: string, query: string, limit?: number) {
  retrieveCalls.push({ workspaceId, query, limit });
  if (query === 'fail') throw new Error('embedding service down');
  const chunk = (text: string, score: number) => ({
    _id: new ObjectId(),
    documentId: new ObjectId(),
    documentTitle: 'Help Center',
    index: 0,
    text,
    score,
  });
  return [chunk('The Explorer plan costs ₹1,299 per month.', 0.912), chunk('We roast every Monday.', 0.55)];
}

/**
 * Starts the app for Supertest with the outside world replaced:
 * - the ingest queue (BullMQ on Redis) by mocks the tests can inspect
 * - the support agent (Gemini) by a fake that answers instantly
 * - vector search (Atlas, plus a Gemini embedding) by a fake with fixed results
 * - the rate limiter's Redis by an in-memory store
 * ES module mocks must be registered before the app is imported, hence the dynamic imports.
 */
export async function startTestApp() {
  // Same signatures as BullMQ's, so tests can check what was queued.
  const queue = {
    add: jest.fn(async (_name: string, _data: { documentId: string }, _options?: { jobId: string }) => ({})),
    remove: jest.fn(async (_jobId: string) => 1),
    close: jest.fn(async () => {}),
  };
  jest.unstable_mockModule('../src/queue.js', () => ({ ingestQueue: queue, INGEST_QUEUE: 'ingest' }));
  jest.unstable_mockModule('../src/lib/retrieve.js', () => ({ retrieve: fakeRetrieve, waitUntilSearchable: async () => {} }));
  jest.unstable_mockModule('../src/lib/agent.js', () => ({
    toModelHistory: () => [],
    streamSupportAgent: async ({ userMessage, onEnd }: { userMessage: DeskmateUIMessage; onEnd: (r: AgentReply) => Promise<void> }) => {
      agentCalls.push(userMessage.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''));
      const message = fakeReply();
      return createUIMessageStream<DeskmateUIMessage>({
        execute: async ({ writer }) => {
          writer.write({ type: 'start', messageId: message.id });
          writer.write({ type: 'tool-input-start', toolCallId: 'call-1', toolName: 'searchDocs' });
          writer.write({ type: 'tool-input-available', toolCallId: 'call-1', toolName: 'searchDocs', input: { query: 'explorer price' } });
          writer.write({ type: 'tool-output-available', toolCallId: 'call-1', output: (message.parts[1] as { output: unknown }).output });
          writer.write({ type: 'text-start', id: 't' });
          writer.write({ type: 'text-delta', id: 't', delta: 'The Explorer plan costs ₹1,299 [1].' });
          writer.write({ type: 'text-end', id: 't' });
          writer.write({ type: 'finish', messageMetadata: message.metadata });
          await onEnd({ message, errored: false });
        },
      });
    },
  }));

  const { setRateLimitStore } = await import('../src/lib/rate-limit.js');
  setRateLimitStore(memoryRateLimitStore());
  const { connectDb, db, users } = await import('../src/db.js');
  const { createApp } = await import('../src/app.js');
  await connectDb();
  await db.dropDatabase(); // each test file starts from an empty database
  await users.createIndex({ email: 1 }, { unique: true }); // signup relies on it to reject duplicates
  return { app: createApp(), queue };
}

export async function stopTestApp() {
  const { closeDb } = await import('../src/db.js');
  await closeDb();
}

/** A logged-in dashboard user: a Supertest agent keeps the session cookie between requests, like a browser. */
export async function signUp(app: Express, name = 'Test Owner') {
  const user = request.agent(app);
  const email = `owner-${randomUUID()}@example.com`;
  const res = await user
    .post('/api/auth/signup')
    .send({ name, email, password: 'a-long-password', workspaceName: 'BrewBox' })
    .expect(201);
  return { user, email, body: res.body as { user: { id: string }; workspace: { id: string } } };
}

/** Reads a UI message stream response into its events. */
export function streamEvents(body: string): { type: string; [key: string]: unknown }[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

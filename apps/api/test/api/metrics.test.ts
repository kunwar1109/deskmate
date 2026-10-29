import type { DeskmateUIMessage } from '@deskmate/shared/chat';
import type { WorkspaceMetrics } from '@deskmate/shared/metrics';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import { ObjectId } from 'mongodb';
import request from 'supertest';
import { signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
let messages: typeof import('../../src/db.js').messages;
beforeAll(async () => {
  ({ app } = await startTestApp());
  ({ messages } = await import('../../src/db.js'));
});
afterAll(stopTestApp);

const DAY = 24 * 60 * 60 * 1000;

/**
 * Writes stored replies directly, with chosen latencies and token counts, so the expected numbers are known.
 * (The fake agent always answers in 5 ms with 100 + 10 tokens: fine for flows, useless for percentiles.)
 */
async function addReply(
  workspaceId: string,
  conversationId: string,
  metadata: NonNullable<DeskmateUIMessage['metadata']>,
  ageMs = 0,
) {
  await messages.insertOne({
    workspaceId,
    conversationId: new ObjectId(conversationId),
    messageId: new ObjectId().toString(),
    role: 'assistant',
    parts: [{ type: 'text', text: 'reply' }],
    metadata,
    createdAt: new Date(Date.now() - ageMs),
  });
}

describe('GET /api/metrics', () => {
  it('adds up the period: replies, handoffs, latency percentiles, tokens and estimated cost', async () => {
    const owner = await signUp(app);
    const workspaceId = owner.body.workspace.id;
    const chat = (await owner.user.post('/api/conversations').expect(201)).body as { id: string };

    // Five bot replies: latencies 1-5 s, 1,000,000 input + 100,000 output tokens in total.
    for (const [i, latencyMs] of [1000, 2000, 3000, 4000, 5000].entries()) {
      await addReply(workspaceId, chat.id, {
        latencyMs,
        usage: { inputTokens: 200_000, outputTokens: 20_000 },
        ...(i === 4 ? { handoffReason: 'not_in_docs' as const } : {}),
      });
    }
    await addReply(workspaceId, chat.id, { sender: { kind: 'human', name: 'Priya' } }); // a person: no tokens
    await addReply(workspaceId, chat.id, { latencyMs: 60_000, usage: { inputTokens: 9_999_999, outputTokens: 0 } }, 10 * DAY); // too old

    const body = (await owner.user.get('/api/metrics?days=7').expect(200)).body as WorkspaceMetrics;

    expect(body.days).toBe(7);
    expect(body.conversations).toEqual({ total: 1, widget: 0, playground: 1 });
    expect(body.botReplies).toBe(5);
    expect(body.humanReplies).toBe(1);
    expect(body.handoffs).toEqual({ total: 1, byReason: { not_in_docs: 1 } });
    expect(body.latencyMs).toEqual({ median: 3000, p95: 5000 });
    expect(body.tokens).toEqual({ input: 1_000_000, output: 100_000 });
    // gemini-flash-lite-latest at $0.30 per 1M input and $2.50 per 1M output: 0.30 + 0.25
    expect(body.cost.model).toBe('gemini-flash-lite-latest');
    expect(body.cost.estimatedUsd).toBeCloseTo(0.55, 10);

    expect(body.recent).toHaveLength(1);
    expect(body.recent[0]).toMatchObject({
      id: chat.id,
      channel: 'playground',
      botReplies: 5,
      tokens: { input: 1_000_000, output: 100_000 },
      avgLatencyMs: 3000,
    });
    expect(body.recent[0]!.estimatedCostUsd).toBeCloseTo(0.55, 10);
  });

  it('counts a real reply end to end (the fake agent stores its latency and tokens like the real one)', async () => {
    const owner = await signUp(app);
    const chat = (await owner.user.post('/api/conversations').expect(201)).body as { id: string };
    await owner.user.post(`/api/conversations/${chat.id}/messages`).send({ text: 'How much is Explorer?' }).expect(200);

    const body = (await owner.user.get('/api/metrics').expect(200)).body as WorkspaceMetrics;
    expect(body.days).toBe(7); // the default
    expect(body.botReplies).toBe(1);
    expect(body.tokens).toEqual({ input: 100, output: 10 });
    expect(body.latencyMs.median).toBe(5);
  });

  it("never includes another workspace's replies", async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const chat = (await a.user.post('/api/conversations').expect(201)).body as { id: string };
    await addReply(a.body.workspace.id, chat.id, { latencyMs: 1000, usage: { inputTokens: 500, outputTokens: 50 } });

    const body = (await b.user.get('/api/metrics').expect(200)).body as WorkspaceMetrics;
    expect(body.botReplies).toBe(0);
    expect(body.tokens).toEqual({ input: 0, output: 0 });
    expect(body.latencyMs).toEqual({ median: null, p95: null });
    expect(body.recent).toEqual([]);
  });

  it('rejects a bad period (400) and requires a login (401)', async () => {
    const owner = await signUp(app);
    await owner.user.get('/api/metrics?days=0').expect(400);
    await owner.user.get('/api/metrics?days=365').expect(400);
    await owner.user.get('/api/metrics?days=abc').expect(400);
    await request(app).get('/api/metrics').expect(401);
  });
});

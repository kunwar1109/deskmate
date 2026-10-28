import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import { signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
beforeAll(async () => ({ app } = await startTestApp()));
afterAll(stopTestApp);

describe('tenant isolation: one company never sees another company data', () => {
  it("documents: B can't list, read or delete A's document", async () => {
    const a = await signUp(app, 'Company A');
    const b = await signUp(app, 'Company B');
    const upload = await a.user.post('/api/documents').attach('file', Buffer.from('# Secret A handbook'), 'a.md').expect(202);
    const id = upload.body.id as string;

    expect((await b.user.get('/api/documents').expect(200)).body).toEqual([]);
    await b.user.get(`/api/documents/${id}`).expect(404);
    await b.user.delete(`/api/documents/${id}`).expect(404);
    expect((await a.user.get('/api/documents').expect(200)).body).toHaveLength(1); // still there for A
  });

  it("conversations: B can't read A's chat or post into it", async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const chat = await a.user.post('/api/conversations').expect(201);
    await b.user.get(`/api/conversations/${chat.body.id}`).expect(404);
    await b.user.post(`/api/conversations/${chat.body.id}/messages`).send({ text: 'hi' }).expect(404);
  });

  it('a made-up or malformed id gets the same 404 as someone else’s', async () => {
    const a = await signUp(app);
    await a.user.get('/api/conversations/000000000000000000000000').expect(404);
    await a.user.get('/api/conversations/not-an-id').expect(404);
  });
});

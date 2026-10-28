import { MAX_UPLOAD_BYTES } from '@deskmate/shared/documents';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import { signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
let queue: Awaited<ReturnType<typeof startTestApp>>['queue'];
beforeAll(async () => ({ app, queue } = await startTestApp()));
afterAll(stopTestApp);

describe('documents', () => {
  it('upload returns 202 right away and queues the work, keyed by document id', async () => {
    const { user } = await signUp(app);
    const res = await user.post('/api/documents').attach('file', Buffer.from('# Help\nShipping is free.'), 'help.md').expect(202);
    expect(res.body).toMatchObject({ title: 'help.md', sourceType: 'text', status: 'processing', chunkCount: 0 });
    expect(res.body).not.toHaveProperty('workspaceId'); // internal ids stay internal
    expect(queue.add).toHaveBeenCalledWith('ingest', { documentId: res.body.id }, { jobId: res.body.id });
  });

  it('rejects unsupported file types (415) and files over the limit (413)', async () => {
    const { user } = await signUp(app);
    await user.post('/api/documents').attach('file', Buffer.from('MZ binary'), 'tool.exe').expect(415);
    const tooBig = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 'a');
    const res = await user.post('/api/documents').attach('file', tooBig, 'big.txt').expect(413);
    expect(res.body.error).toMatch(/10 MB/);
  });

  it('upload without a file is a 400', async () => {
    const { user } = await signUp(app);
    await user.post('/api/documents').expect(400);
  });

  it('delete removes the document and its queued job', async () => {
    const { user } = await signUp(app);
    const { body } = await user.post('/api/documents').attach('file', Buffer.from('Some text'), 'x.txt').expect(202);
    await user.delete(`/api/documents/${body.id}`).expect(204);
    expect(queue.remove).toHaveBeenCalledWith(body.id);
    expect((await user.get('/api/documents').expect(200)).body).toEqual([]);
  });
});

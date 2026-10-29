import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CreatedApiKey } from '@deskmate/shared/api-keys';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Express } from 'express';
import request from 'supertest';
import { retrieveCalls, signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
let server: Server;
let mcpUrl: URL;

// A real port, so the official MCP client talks to the server exactly as Claude or Cursor would.
beforeAll(async () => {
  ({ app } = await startTestApp());
  server = app.listen(0);
  mcpUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
});
afterAll(async () => {
  server.close();
  await stopTestApp();
});

async function connect(key: string) {
  const client = new Client({ name: 'deskmate-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  return client;
}

async function ownerWithKey(name = 'Cursor') {
  const owner = await signUp(app);
  const key = (await owner.user.post('/api/api-keys').send({ name }).expect(201)).body as CreatedApiKey;
  return { ...owner, key };
}

describe('API keys', () => {
  it('shows a new key once; afterwards only its prefix', async () => {
    const { user, key } = await ownerWithKey('Cursor on my laptop');
    expect(key.key).toMatch(/^dmk_[\w-]{43}$/); // 32 random bytes, base64url
    expect(key.prefix).toBe(key.key.slice(0, 10));

    const list = (await user.get('/api/api-keys').expect(200)).body;
    expect(list.mcpUrl).toBe('http://localhost:4000/mcp');
    expect(list.keys).toEqual([{ id: key.id, name: 'Cursor on my laptop', prefix: key.prefix, createdAt: key.createdAt, lastUsedAt: null }]);
    expect(JSON.stringify(list)).not.toContain(key.key);
  });

  it("can't be seen or deleted by another workspace", async () => {
    const a = await ownerWithKey();
    const b = await signUp(app);
    expect((await b.user.get('/api/api-keys').expect(200)).body.keys).toEqual([]);
    await b.user.delete(`/api/api-keys/${a.key.id}`).expect(404);
    expect((await a.user.get('/api/api-keys').expect(200)).body.keys).toHaveLength(1);
  });

  it('validates the name, caps keys at 10 and needs a login', async () => {
    const owner = await signUp(app);
    await owner.user.post('/api/api-keys').send({ name: '  ' }).expect(400);
    for (let i = 0; i < 10; i++) await owner.user.post('/api/api-keys').send({ name: `key ${i}` }).expect(201);
    await owner.user.post('/api/api-keys').send({ name: 'one too many' }).expect(409);
    await request(app).get('/api/api-keys').expect(401);
  });
});

describe('MCP server', () => {
  it('refuses requests without a valid key (401, with WWW-Authenticate)', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const noKey = await request(app).post('/mcp').send(body).expect(401);
    expect(noKey.headers['www-authenticate']).toBe('Bearer');
    await request(app).post('/mcp').set('Authorization', 'Bearer dmk_not-a-real-key').send(body).expect(401);
    await request(app).get('/mcp').expect(405); // stateless: no session stream
  });

  it('lists one read-only tool', async () => {
    const { key } = await ownerWithKey();
    const client = await connect(key.key);
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map((t) => t.name)).toEqual(['search_knowledge_base']);
    expect(tools[0]!.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools[0]!.title).toMatch(/help center/);
  });

  it("searches the key's own workspace and drops weak matches", async () => {
    const { key, body } = await ownerWithKey();
    const client = await connect(key.key);
    retrieveCalls.length = 0;
    const result = await client.callTool({ name: 'search_knowledge_base', arguments: { query: 'explorer price', limit: 3 } });
    await client.close();

    // Scoped by the key: the request can't name a workspace.
    expect(retrieveCalls).toEqual([{ workspaceId: body.workspace.id, query: 'explorer price', limit: 3 }]);
    expect(result.structuredContent).toEqual({
      passages: [{ title: 'Help Center', score: 0.912, text: 'The Explorer plan costs ₹1,299 per month.' }],
    }); // the 0.55 passage is below MIN_RELEVANCE
    expect(JSON.stringify(result.content)).toContain('[1] Help Center (score 0.912)');
  });

  it('records when a key was last used', async () => {
    const { user, key } = await ownerWithKey();
    const client = await connect(key.key);
    await client.listTools();
    await client.close();

    await new Promise((resolve) => setTimeout(resolve, 50)); // the update isn't awaited by the request
    const [summary] = (await user.get('/api/api-keys').expect(200)).body.keys;
    expect(summary.lastUsedAt).not.toBeNull();
  });

  it('turns a failed search into a tool error, not a crash', async () => {
    const { key } = await ownerWithKey();
    const client = await connect(key.key);
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {}); // describeAiError logs it
    const result = await client.callTool({ name: 'search_knowledge_base', arguments: { query: 'fail' } });
    quiet.mockRestore();
    await client.close();

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Something went wrong');
  });

  it('stops working the moment the key is deleted', async () => {
    const { user, key } = await ownerWithKey();
    await user.delete(`/api/api-keys/${key.id}`).expect(204);
    await expect(connect(key.key)).rejects.toThrow();
  });
});

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
beforeAll(async () => ({ app } = await startTestApp()));
afterAll(stopTestApp);

async function ownerWithWidget() {
  const owner = await signUp(app);
  const settings = (await owner.user.get('/api/widget').expect(200)).body as { key: string; scriptUrl: string };
  return { ...owner, key: settings.key, settings };
}

describe('widget settings and the public widget API', () => {
  it('creates one key per workspace, and the same key on every read', async () => {
    const { user, key, settings } = await ownerWithWidget();
    expect(key).toMatch(/^wk_/);
    expect(settings.scriptUrl).toMatch(/\/widget\.js$/);
    expect((await user.get('/api/widget').expect(200)).body.key).toBe(key);
  });

  it('the public config needs no login, and an unknown key is a 404', async () => {
    const { key } = await ownerWithWidget();
    expect((await request(app).get(`/api/public/w/${key}`).expect(200)).body).toEqual({ workspaceName: 'BrewBox' });
    await request(app).get('/api/public/w/wk_does_not_exist').expect(404);
  });

  it('allowed origins: other sites get 403 (with CORS headers, so the widget can show why)', async () => {
    const { user, key } = await ownerWithWidget();
    await user.put('/api/widget/allowed-origins').send({ allowedOrigins: ['https://shop.example/'] }).expect(400);
    await user.put('/api/widget/allowed-origins').send({ allowedOrigins: ['https://shop.example'] }).expect(200);

    const allowed = await request(app).get(`/api/public/w/${key}`).set('Origin', 'https://shop.example').expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://shop.example');
    const refused = await request(app).get(`/api/public/w/${key}`).set('Origin', 'https://evil.example').expect(403);
    expect(refused.headers['access-control-allow-origin']).toBe('https://evil.example');
    expect(refused.body.error).toMatch(/not allowed/);
    await request(app).get(`/api/public/w/${key}`).expect(403); // no Origin at all, once a list is set
  });

  it('answers the CORS preflight for an allowed site', async () => {
    const { key } = await ownerWithWidget();
    const res = await request(app)
      .options(`/api/public/w/${key}/conversations`)
      .set('Origin', 'https://shop.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined(); // the widget never sends cookies
  });

  it('rotating the key stops the old one immediately', async () => {
    const { user, key } = await ownerWithWidget();
    const rotated = (await user.post('/api/widget/rotate-key').expect(200)).body.key as string;
    expect(rotated).not.toBe(key);
    await request(app).get(`/api/public/w/${key}`).expect(404);
    await request(app).get(`/api/public/w/${rotated}`).expect(200);
  });

  it('rate limits messages per IP: the 11th in a minute gets 429 with Retry-After', async () => {
    const { key } = await ownerWithWidget();
    const chat = (await request(app).post(`/api/public/w/${key}/conversations`).expect(201)).body;
    const send = () =>
      request(app)
        .post(`/api/public/w/${key}/conversations/${chat.conversationId}/messages`)
        .set('Authorization', `Bearer ${chat.visitorToken}`)
        .set('X-Forwarded-For', '203.0.113.7') // ignored: TRUST_PROXY_HOPS is 0, so clients can't fake their IP
        .send({ text: '' }); // empty text: counted, then rejected with 400, so no bot reply is needed
    for (let i = 0; i < 10; i++) await send().expect(400);
    const limited = await send().expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts per visitor from CLIENT_IP_HEADER, which the host sets, and never from X-Forwarded-For', async () => {
    const { key } = await ownerWithWidget();
    const chat = (await request(app).post(`/api/public/w/${key}/conversations`).expect(201)).body;
    const send = (ip: string) =>
      request(app)
        .post(`/api/public/w/${key}/conversations/${chat.conversationId}/messages`)
        .set('Authorization', `Bearer ${chat.visitorToken}`)
        .set('x-test-client-ip', ip)
        .set('X-Forwarded-For', `198.51.100.${Math.floor(Math.random() * 250)}`) // changes every time: ignored
        .send({ text: '' });
    for (let i = 0; i < 10; i++) await send('203.0.113.1').expect(400);
    await send('203.0.113.1').expect(429);
    await send('203.0.113.2').expect(400); // another visitor has their own allowance
  });
});

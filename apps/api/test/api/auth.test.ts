import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
beforeAll(async () => ({ app } = await startTestApp()));
afterAll(stopTestApp);

describe('signup and login', () => {
  it('signup creates the user and workspace and sets an httpOnly session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Priya', email: 'Priya@Example.com', password: 'a-long-password', workspaceName: 'BrewBox' })
      .expect(201);
    expect(res.body.user).toMatchObject({ name: 'Priya', email: 'priya@example.com' }); // stored lowercased
    expect(res.body.workspace).toMatchObject({ name: 'BrewBox' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i); // never sent back
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^deskmate_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('rejects a second account with the same email (409), whatever the letter case', async () => {
    const { email } = await signUp(app);
    await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Copy', email: email.toUpperCase(), password: 'a-long-password', workspaceName: 'Other' })
      .expect(409);
  });

  it('rejects invalid input with readable reasons (400)', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: '', email: 'nope', password: 'short' }).expect(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('a wrong password and an unknown email get the same answer, so emails cannot be probed', async () => {
    const { email } = await signUp(app);
    const wrongPassword = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401);
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('login, me and logout', async () => {
    const { email, user } = await signUp(app, 'Arjun');
    await user.post('/api/auth/logout').expect(204);
    await user.get('/api/auth/me').expect(401);
    await user.post('/api/auth/login').send({ email, password: 'a-long-password' }).expect(200);
    const me = await user.get('/api/auth/me').expect(200);
    expect(me.body.user.name).toBe('Arjun');
  });

  it('a forged or tampered cookie is rejected', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'deskmate_session=eyJhbGciOiJub25lIn0.e30.').expect(401);
  });
});

describe('every dashboard route needs a login', () => {
  it.each(['/api/documents', '/api/conversations', '/api/widget', '/api/realtime/ticket'])('GET %s -> 401', async (path) => {
    await request(app).get(path).expect(401);
  });
});

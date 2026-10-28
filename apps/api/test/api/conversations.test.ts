import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { agentCalls, signUp, startTestApp, stopTestApp, streamEvents } from '../helpers.js';

let app: Express;
beforeAll(async () => ({ app } = await startTestApp()));
afterAll(stopTestApp);
beforeEach(() => {
  agentCalls.length = 0;
});

/** An owner with a widget, and a visitor who started a chat on their site. */
async function widgetChat() {
  const owner = await signUp(app, 'Priya');
  const { key } = (await owner.user.get('/api/widget').expect(200)).body as { key: string };
  const { conversationId, visitorToken } = (await request(app).post(`/api/public/w/${key}/conversations`).expect(201)).body;
  const base = `/api/public/w/${key}/conversations/${conversationId}`;
  const visitor = {
    say: (text: string) => request(app).post(`${base}/messages`).set('Authorization', `Bearer ${visitorToken}`).send({ text }).expect(200),
    history: (token = visitorToken) => request(app).get(base).set('Authorization', `Bearer ${token}`),
  };
  return { owner, conversationId, visitor };
}

describe('visitor chats', () => {
  it('only the browser holding the visitor token can read the chat', async () => {
    const { visitor } = await widgetChat();
    await visitor.history().expect(200);
    await visitor.history('a-guessed-token').expect(404);
  });

  it('the customer gets the answer and source titles, never scores or tool calls', async () => {
    const { visitor } = await widgetChat();
    const res = await visitor.say('How much is Explorer?');
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = streamEvents(res.text);
    expect(events.map((e) => e.type)).toContain('text-delta');
    expect(events).toContainEqual({ type: 'data-sources', data: [{ n: 1, title: 'Help Center' }] });
    expect(res.text).not.toMatch(/score|tool-|explorer price/);

    const saved = (await visitor.history().expect(200)).body;
    expect(saved.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(saved)).not.toMatch(/score|tool-/);
  });

  it('the owner sees the full reply, with the tool trace, in the dashboard', async () => {
    const { owner, conversationId, visitor } = await widgetChat();
    await visitor.say('How much is Explorer?');
    const { body } = await owner.user.get(`/api/conversations/${conversationId}`).expect(200);
    expect(body.conversation).toMatchObject({ channel: 'widget', status: 'open', title: 'How much is Explorer?' });
    expect(body.messages[1].parts.some((p: { type: string }) => p.type === 'tool-searchDocs')).toBe(true);
    expect(new Set(body.messages.map((m: { id: string }) => m.id)).size).toBe(2); // unique, non-empty ids
  });
});

describe('human handoff', () => {
  it('a team reply takes the chat over, and the bot stays quiet until it is handed back', async () => {
    const { owner, conversationId, visitor } = await widgetChat();
    await visitor.say('First question');
    expect(agentCalls).toEqual(['First question']);

    const reply = await owner.user.post(`/api/conversations/${conversationId}/replies`).send({ text: "Hi, I'm here to help." }).expect(201);
    expect(reply.body.metadata.sender).toEqual({ kind: 'human', name: 'Priya' });
    const inbox = (await owner.user.get('/api/conversations?status=handed_off').expect(200)).body;
    expect(inbox.map((c: { id: string }) => c.id)).toEqual([conversationId]);

    // While a person handles the chat, the customer's messages wait for them and the bot doesn't answer.
    const quiet = await visitor.say('Thanks, one more thing...');
    expect(streamEvents(quiet.text).some((e) => e.type === 'text-delta')).toBe(false);
    expect(agentCalls).toEqual(['First question']);

    await owner.user.post(`/api/conversations/${conversationId}/status`).send({ status: 'open' }).expect(200);
    await visitor.say('Back to the bot');
    expect(agentCalls).toEqual(['First question', 'Back to the bot']);
  });

  it('the customer sees the team member’s name, and the waiting message is kept', async () => {
    const { owner, conversationId, visitor } = await widgetChat();
    await owner.user.post(`/api/conversations/${conversationId}/replies`).send({ text: 'Hello from the team' }).expect(201);
    await visitor.say('Is anyone there?');
    const { body } = await visitor.history().expect(200);
    expect(body.status).toBe('handed_off');
    const human = body.messages.find((m: { metadata?: { sender?: unknown } }) => m.metadata?.sender);
    expect(human.metadata.sender).toEqual({ kind: 'human', name: 'Priya' });
    expect(body.messages.at(-1).parts[0].text).toBe('Is anyone there?');
  });

  it('a closed chat reopens with the bot when the customer writes again', async () => {
    const { owner, conversationId, visitor } = await widgetChat();
    await owner.user.post(`/api/conversations/${conversationId}/status`).send({ status: 'closed' }).expect(200);
    await visitor.say('New question');
    expect(agentCalls).toEqual(['New question']);
    const { body } = await owner.user.get(`/api/conversations/${conversationId}`).expect(200);
    expect(body.conversation.status).toBe('open');
  });

  it('playground and customer chats stay apart', async () => {
    const { owner, conversationId } = await widgetChat();
    const playground = (await owner.user.post('/api/conversations').expect(201)).body.id as string;
    // The owner can't post test messages into a customer's chat, or human replies into a test chat.
    await owner.user.post(`/api/conversations/${conversationId}/messages`).send({ text: 'test' }).expect(409);
    await owner.user.post(`/api/conversations/${playground}/replies`).send({ text: 'hi' }).expect(409);
    // The inbox lists customer chats only.
    const all = (await owner.user.get('/api/conversations').expect(200)).body.map((c: { id: string }) => c.id);
    expect(all).toEqual([conversationId]);
  });

});

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/node';
import type { Envelope, Event } from '@sentry/core';
import type { Express } from 'express';
import { signUp, startTestApp, stopTestApp } from '../helpers.js';

let app: Express;
let messages: typeof import('../../src/db.js').messages;

/** Events Sentry would have sent. A fake transport keeps them in memory: no network, no Sentry account. */
const sent: Event[] = [];

beforeAll(async () => {
  // Sentry warns that its module-loader hooks can't run inside Jest. They only add tracing; this test checks
  // what gets reported, which doesn't need them. Silenced for init only, so other warnings still show.
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  Sentry.init({
    dsn: 'https://public@sentry.example/1', // any well-formed DSN: the fake transport never sends it anywhere
    defaultIntegrations: false,
    transport: () => ({
      send: async (envelope: Envelope) => {
        for (const [header, payload] of envelope[1]) if (header.type === 'event') sent.push(payload as Event);
        return {};
      },
      flush: async () => true,
    }),
  });
  warn.mockRestore();
  ({ app } = await startTestApp());
  ({ messages } = await import('../../src/db.js'));
});
afterAll(async () => {
  await Sentry.close();
  await stopTestApp();
});
beforeEach(() => {
  sent.length = 0;
});

describe('error reporting', () => {
  it('reports an unexpected 500 with the workspace and user ids, never their names or emails', async () => {
    const owner = await signUp(app, 'Priya');
    // Make the database fail for this one call, the way a real outage would surface.
    const spy = jest.spyOn(messages, 'aggregate').mockImplementationOnce(() => {
      throw new Error('connection pool closed');
    });
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {}); // the handler logs it too; expected here

    const res = await owner.user.get('/api/metrics').expect(500);
    spy.mockRestore();
    quiet.mockRestore();
    expect(res.body).toEqual({ error: 'Something went wrong' }); // the client sees no internals
    await Sentry.flush(1000);

    expect(sent).toHaveLength(1);
    const event = sent[0]!;
    expect(event.exception?.values?.[0]?.value).toBe('connection pool closed');
    expect(event.tags).toMatchObject({ workspaceId: owner.body.workspace.id });
    expect(event.user).toEqual({ id: owner.body.user.id });
    expect(JSON.stringify(event)).not.toContain(owner.email);
    expect(JSON.stringify(event)).not.toContain('Priya');
  });

  it('does not report expected errors: bad input (400) or not found (404)', async () => {
    const owner = await signUp(app);
    await owner.user.get('/api/metrics?days=0').expect(400);
    await owner.user.get('/api/conversations/000000000000000000000000').expect(404);
    await Sentry.flush(1000);

    expect(sent).toEqual([]);
  });
});

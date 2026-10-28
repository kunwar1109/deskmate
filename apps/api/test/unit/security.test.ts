import { AllowedOriginsBody } from '@deskmate/shared/widget';
import { describe, expect, it } from '@jest/globals';
import { createRealtimeTicket, createSessionToken, readRealtimeTicket } from '../../src/lib/auth.js';
import { findOrder } from '../../src/lib/mock-orders.js';
import { generateVisitorToken, generateWidgetKey, hashToken, isOriginAllowed, tokenMatches } from '../../src/lib/widget.js';

describe('visitor tokens', () => {
  it('only the original token matches its stored hash', () => {
    const token = generateVisitorToken();
    const stored = hashToken(token);
    expect(stored).not.toContain(token); // the database never holds the token itself
    expect(tokenMatches(token, stored)).toBe(true);
    expect(tokenMatches(generateVisitorToken(), stored)).toBe(false);
    expect(tokenMatches('', stored)).toBe(false);
  });

  it('are random every time', () => {
    expect(new Set(Array.from({ length: 50 }, generateVisitorToken)).size).toBe(50);
  });
});

describe('widget keys and origins', () => {
  it('keys are prefixed and URL-safe', () => {
    expect(generateWidgetKey()).toMatch(/^wk_[A-Za-z0-9_-]{24}$/);
  });

  it('an empty allow-list allows every site; otherwise only exact origins', () => {
    expect(isOriginAllowed([], 'https://anything.example')).toBe(true);
    const list = ['https://shop.example'];
    expect(isOriginAllowed(list, 'https://shop.example')).toBe(true);
    expect(isOriginAllowed(list, 'https://www.shop.example')).toBe(false);
    expect(isOriginAllowed(list, 'http://shop.example')).toBe(false);
    expect(isOriginAllowed(list, undefined)).toBe(false); // a script without an Origin header
  });

  it('the settings form only accepts real origins', () => {
    expect(AllowedOriginsBody.safeParse({ allowedOrigins: ['https://shop.example', 'http://localhost:5173'] }).success).toBe(true);
    for (const bad of ['https://shop.example/', 'https://shop.example/page', 'shop.example', 'javascript:alert(1)']) {
      expect(AllowedOriginsBody.safeParse({ allowedOrigins: [bad] }).success).toBe(false);
    }
  });
});

describe('session cookies vs socket tickets', () => {
  const auth = { userId: 'u1', workspaceId: 'w1' };

  it('a ticket is accepted for sockets', async () => {
    expect(await readRealtimeTicket(await createRealtimeTicket(auth))).toEqual(auth);
  });

  it('a 7-day session cookie is not accepted as a socket ticket (different signing key)', async () => {
    expect(await readRealtimeTicket(await createSessionToken(auth))).toBeNull();
  });

  it('garbage is rejected', async () => {
    expect(await readRealtimeTicket('not-a-jwt')).toBeNull();
    expect(await readRealtimeTicket(undefined)).toBeNull();
  });
});

describe('mock order lookup', () => {
  it('needs both the order number and the matching email', () => {
    expect(findOrder('BB-10234', 'priya@example.com')?.status).toBe('shipped');
    expect(findOrder('bb-10234', ' PRIYA@example.com ')?.status).toBe('shipped'); // forgiving about case and spaces
    expect(findOrder('BB-10234', 'someone@example.com')).toBeNull();
    expect(findOrder('BB-10234', 'priya@example.com')).not.toHaveProperty('email'); // never echoes the email back
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { RateLimitError } from '../../src/lib/errors.js';
import { checkRateLimit, rateLimit, setRateLimitStore } from '../../src/lib/rate-limit.js';
import { memoryRateLimitStore } from '../helpers.js';

const rule = { name: 'test', limit: 3, windowSeconds: 60 };

describe('rate limiting', () => {
  it('allows `limit` hits per key, then throws 429 with a retry time', async () => {
    setRateLimitStore(memoryRateLimitStore());
    for (let i = 0; i < 3; i++) await checkRateLimit(rule, 'ip-a');
    const error = await checkRateLimit(rule, 'ip-a').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).status).toBe(429);
    expect((error as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each key separately', async () => {
    setRateLimitStore(memoryRateLimitStore());
    for (let i = 0; i < 3; i++) await checkRateLimit(rule, 'ip-a');
    await expect(checkRateLimit(rule, 'ip-b')).resolves.toBeUndefined();
  });

  it('fails open when the store is down, so a Redis outage does not take the widget down', async () => {
    setRateLimitStore({ hit: async () => Promise.reject(new Error('connection refused')) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkRateLimit(rule, 'ip-a')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('the middleware keys by whatever the rule says (here: the IP)', async () => {
    setRateLimitStore(memoryRateLimitStore());
    const middleware = rateLimit({ ...rule, limit: 1, key: (req) => req.ip ?? '' });
    const next = jest.fn();
    const req = { ip: '1.2.3.4' } as Request;
    await middleware(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    await expect(middleware(req, {} as Response, next)).rejects.toBeInstanceOf(RateLimitError);
  });
});

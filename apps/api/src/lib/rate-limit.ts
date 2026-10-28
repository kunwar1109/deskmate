import type { Request, RequestHandler, Response } from 'express';
import { Redis, type Result } from 'ioredis';
import { env } from '../config.js';
import { RateLimitError } from './errors.js';

// Count one request in a fixed window: INCR the counter, and on the first hit start the window's timer.
// As a Lua script it runs atomically in Redis, so a crash between the two steps can't leave a counter
// that never expires (which would block that client forever). Returns [count, seconds left in the window].
const HIT_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    hitWindow(key: string, windowSeconds: number): Result<[number, number], Context>;
  }
}

/** Where request counts live. Redis in production; tests swap in an in-memory store (setRateLimitStore). */
export interface RateLimitStore {
  /** Counts one hit in `key`'s window and returns [hits so far, seconds until the window resets]. */
  hit(key: string, windowSeconds: number): Promise<[number, number]>;
  close?(): Promise<void>;
}

function redisStore(): RateLimitStore {
  // Its own connection, separate from BullMQ's: those wait indefinitely by design, a rate-limit check must fail fast.
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 1000 });
  redis.on('error', (err) => console.warn('Rate limit Redis error:', err.message));
  redis.defineCommand('hitWindow', { numberOfKeys: 1, lua: HIT_WINDOW }); // sent once, then called by its hash
  return {
    hit: (key, windowSeconds) => redis.hitWindow(key, windowSeconds),
    close: async () => {
      await redis.quit();
    },
  };
}

// Created on first use, so importing this module (in tests, in scripts) doesn't open a Redis connection.
let store: RateLimitStore | undefined;

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export async function closeRateLimiter() {
  await store?.close?.();
}

interface RateLimitRule {
  name: string; // part of the Redis key, e.g. "messages-ip"
  limit: number;
  windowSeconds: number;
  key: (req: Request, res: Response) => string; // who is being counted: an IP, a workspace id
}

/**
 * Express middleware: allows `limit` requests per `windowSeconds` per key, then answers 429 with Retry-After.
 *
 * Fixed windows are the simplest scheme that works across several API servers (the count lives in Redis).
 * The trade-off: a client can send `limit` requests at the end of one window and `limit` more at the start of
 * the next. That's acceptable here; the per-workspace limit still caps total spend.
 *
 * If Redis is down, requests are allowed (fail open): an outage of the limiter shouldn't take the
 * support widget down with it. Gemini's own quota is the backstop.
 */
export function rateLimit(rule: RateLimitRule): RequestHandler {
  return async (req, res, next) => {
    await checkRateLimit(rule, rule.key(req, res));
    next();
  };
}

/** The same check, called directly, for limits that must only count requests that passed validation. */
export async function checkRateLimit({ name, limit, windowSeconds }: Omit<RateLimitRule, 'key'>, key: string) {
  let count: number;
  let ttl: number;
  try {
    store ??= redisStore();
    [count, ttl] = await store.hit(`rl:${name}:${key}`, windowSeconds);
  } catch (err) {
    console.warn(`Rate limiter unavailable, allowing request (${name}):`, (err as Error).message);
    return;
  }
  if (count > limit) throw new RateLimitError(ttl > 0 ? ttl : windowSeconds);
}

/** The client's IP. Behind a proxy this is only right when TRUST_PROXY_HOPS is set (see index.ts). */
export const byIp = (req: Request) => req.ip ?? 'unknown';

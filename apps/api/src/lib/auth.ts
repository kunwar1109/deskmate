import argon2 from 'argon2';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { env, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../config.js';
import { UnauthorizedError } from './errors.js';

export interface AuthContext {
  userId: string;
  workspaceId: string;
}

// Lets TypeScript know requireAuth adds `req.auth`.
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Passwords: argon2id is memory-hard, so brute-forcing a leaked hash on GPUs is expensive.
 * The library defaults (64 MB, 3 iterations) follow OWASP guidance.
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Sessions: a signed JWT in an httpOnly cookie. The server stores nothing per session; the signature proves
 * we issued it. Trade-off: a token can't be revoked before it expires (7 days). Fine while there's no
 * "remove member" feature; add a token version or session store when there is.
 */
const secret = new TextEncoder().encode(env.JWT_SECRET);

export function createSessionToken(auth: AuthContext): Promise<string> {
  return new SignJWT({ wid: auth.workspaceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(auth.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

async function readSessionToken(token: string): Promise<AuthContext | null> {
  try {
    // Pinning the algorithm stops "alg: none" style token forgery.
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.wid !== 'string') return null;
    return { userId: payload.sub, workspaceId: payload.wid };
  } catch {
    return null; // expired, tampered with, or not a JWT at all
  }
}

const cookieOptions: CookieOptions = {
  httpOnly: true, // browser JavaScript can't read it, so an XSS bug can't steal the session
  sameSite: 'lax', // not sent on cross-site POSTs, which blocks classic CSRF
  secure: env.NODE_ENV === 'production', // HTTPS-only in production; local dev is plain http
  path: '/',
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

/** Middleware: rejects the request with 401 unless it carries a valid session cookie. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const auth = typeof token === 'string' ? await readSessionToken(token) : null;
  if (!auth) throw new UnauthorizedError();
  req.auth = auth;
  next();
};

/** The logged-in user and workspace. Throws if the route forgot requireAuth, so a mistake fails closed. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}

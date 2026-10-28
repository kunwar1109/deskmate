import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { WidgetSettings } from '@deskmate/shared/widget';
import { ObjectId } from 'mongodb';
import { env } from '../config.js';
import { workspaces } from '../db.js';

/**
 * The widget key is public: it sits in the customer's page source, so it's stored as is and hashing it
 * would protect nothing. It only says which workspace a request is for. Abuse is limited by the
 * allowed-origins list and rate limits, not by keeping the key secret.
 */
export function generateWidgetKey(): string {
  return `wk_${randomBytes(18).toString('base64url')}`;
}

/**
 * The visitor token IS a secret: it's what lets a browser read and continue one chat. Only its hash is stored,
 * so a leaked database doesn't let anyone take over customer chats.
 */
export function generateVisitorToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256, not argon2 like passwords: argon2 is slow on purpose to resist guessing low-entropy passwords.
// A 256-bit random token can't be guessed, so a fast hash is enough and keeps every widget request cheap.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The workspace's widget settings, creating the key on first use (workspaces made before widgets existed). */
export async function ensureWidget(workspaceId: string): Promise<WidgetSettings> {
  const _id = new ObjectId(workspaceId);
  // Conditional update: two tabs opening settings at once can't create two different keys.
  await workspaces.updateOne(
    { _id, widget: { $exists: false } },
    { $set: { widget: { key: generateWidgetKey(), allowedOrigins: [] } } },
  );
  const workspace = await workspaces.findOne({ _id }, { projection: { widget: 1 } });
  if (!workspace?.widget) throw new Error(`Workspace ${workspaceId} has no widget settings`);
  return { key: workspace.widget.key, allowedOrigins: workspace.widget.allowedOrigins, scriptUrl: `${env.PUBLIC_URL}/widget.js` };
}

/**
 * Browsers always send Origin on cross-site requests, and pages can't fake it. That stops another website from
 * embedding a workspace's widget and spending its AI quota through its visitors. (A script outside a browser
 * can set any Origin; the rate limits handle those.) An empty list allows every site.
 */
export function isOriginAllowed(allowedOrigins: string[], origin: string | undefined): boolean {
  return allowedOrigins.length === 0 || (origin !== undefined && allowedOrigins.includes(origin));
}

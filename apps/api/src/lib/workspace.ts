import type { Request } from 'express';
import { getAuth } from './auth.js';

/**
 * Every query in Deskmate is scoped to a workspace (one per customer company).
 * The id comes from the verified session cookie, never from the request body or URL,
 * so nobody can read another workspace's data by sending a different id.
 */
export function getWorkspaceId(req: Request): string {
  return getAuth(req).workspaceId;
}

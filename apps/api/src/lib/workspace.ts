import type { Request } from 'express';
import { env } from '../config.js';

/**
 * Every query in Deskmate is scoped to a workspace (one per customer company).
 * Phase 1: there is no login yet, so everything goes to the dev workspace.
 * Phase 2: this reads the workspace from the verified JWT instead. Routes won't need to change.
 */
export function getWorkspaceId(_req: Request): string {
  return env.DEV_WORKSPACE_ID;
}

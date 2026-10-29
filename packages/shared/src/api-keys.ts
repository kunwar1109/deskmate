import { z } from 'zod';

/**
 * Workspace API keys: let tools outside the dashboard (an MCP client like Claude or Cursor) search the
 * workspace's knowledge base. Unlike the widget key, these are secrets: shown once, stored as a hash.
 */
export const MAX_API_KEYS = 10;

export const CreateApiKeyBody = z.object({
  name: z.string().trim().min(1, 'Give the key a name, like "Cursor on my laptop"').max(60, 'Name is too long'),
});
export type CreateApiKeyInput = z.input<typeof CreateApiKeyBody>;

/** A key as the dashboard lists it: never the key itself, only its first characters to tell keys apart. */
export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string; // e.g. "dmk_Xq3vR9", enough to recognise a key, useless to use it
  createdAt: string;
  lastUsedAt: string | null;
}

/** Returned once, by the request that creates the key. */
export interface CreatedApiKey extends ApiKeySummary {
  key: string;
}

export interface ApiKeyList {
  mcpUrl: string; // where MCP clients connect
  keys: ApiKeySummary[];
}

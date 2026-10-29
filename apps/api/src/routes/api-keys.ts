import { CreateApiKeyBody, type ApiKeyList, type CreatedApiKey } from '@deskmate/shared/api-keys';
import { Router } from 'express';
import { env } from '../config.js';
import { getAuth } from '../lib/auth.js';
import { createApiKey, deleteApiKey, listApiKeys } from '../lib/api-keys.js';
import { getWorkspaceId } from '../lib/workspace.js';

/** The owner manages API keys for MCP access (logged in). */
export const apiKeysRouter = Router();

apiKeysRouter.get('/', async (req, res) => {
  const body: ApiKeyList = { mcpUrl: `${env.PUBLIC_URL}/mcp`, keys: await listApiKeys(getWorkspaceId(req)) };
  res.json(body);
});

apiKeysRouter.post('/', async (req, res) => {
  const { name } = CreateApiKeyBody.parse(req.body);
  const body: CreatedApiKey = await createApiKey(getWorkspaceId(req), getAuth(req).userId, name);
  res.status(201).json(body);
});

apiKeysRouter.delete('/:id', async (req, res) => {
  await deleteApiKey(getWorkspaceId(req), req.params.id);
  res.status(204).end();
});

import type { IncomingMessage } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router, type RequestHandler } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { env, RATE_LIMITS } from '../config.js';
import { workspaces } from '../db.js';
import { describeAiError } from '../lib/ai-errors.js';
import { findApiKey } from '../lib/api-keys.js';
import { UnauthorizedError } from '../lib/errors.js';
import { rateLimit } from '../lib/rate-limit.js';
import { retrieve } from '../lib/retrieve.js';

/**
 * MCP server (Model Context Protocol): lets AI tools like Claude or Cursor search one workspace's help docs.
 * Streamable HTTP, stateless: every POST /mcp gets a fresh server whose tool closes over the workspace of the
 * API key that sent it, like the agent's tools close over the chat's workspace. Nothing is kept between
 * requests, so any API instance can answer any request.
 */
export const mcpRouter = Router();

interface McpLocals {
  workspaceId: string;
  workspaceName: string;
  apiKeyId: string;
}

/** Authorization: Bearer dmk_... The key decides the workspace; nothing in the request body can. */
const requireApiKey: RequestHandler = async (req, res, next) => {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  const key = token ? await findApiKey(token) : null;
  if (!key) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    throw new UnauthorizedError('Send a Deskmate API key as "Authorization: Bearer dmk_..."');
  }
  const workspace = await workspaces.findOne({ _id: new ObjectId(key.workspaceId) }, { projection: { name: 1 } });
  const locals: McpLocals = { workspaceId: key.workspaceId, workspaceName: workspace?.name ?? 'this company', apiKeyId: key._id.toString() };
  res.locals.mcp = locals;
  next();
};

const Passage = z.object({
  title: z.string().describe('Title of the document the passage comes from'),
  page: z.number().optional().describe('PDF page number, when the document is a PDF'),
  score: z.number().describe('Similarity to the query, 0 to 1'),
  text: z.string(),
});

function buildServer({ workspaceId, workspaceName }: McpLocals): McpServer {
  const server = new McpServer({ name: 'deskmate', version: '0.1.0' });

  server.registerTool(
    'search_knowledge_base',
    {
      title: `Search ${workspaceName}'s help center`,
      description:
        `Semantic search over ${workspaceName}'s help-center documents (policies, plans, shipping, FAQs). ` +
        'Returns the most relevant passages with their document title and a 0-1 similarity score. ' +
        'Weak matches are left out, so an empty result means the documents do not cover the question.',
      inputSchema: {
        query: z.string().trim().min(1).max(500).describe('What to look for, as a standalone question or phrase'),
        limit: z.number().int().min(1).max(10).default(5).describe('How many passages to return at most'),
      },
      outputSchema: { passages: z.array(Passage) },
      annotations: { readOnlyHint: true, openWorldHint: false }, // reads this workspace's documents, changes nothing
    },
    async ({ query, limit }) => {
      try {
        const results = await retrieve(workspaceId, query, limit);
        // Same guardrail as the support agent: passages below MIN_RELEVANCE are noise, and an AI tool given
        // noise tends to answer from it anyway.
        const passages = results
          .filter((r) => r.score >= env.MIN_RELEVANCE)
          .map((r) => ({
            title: r.documentTitle,
            ...(r.page !== undefined ? { page: r.page } : {}),
            score: Number(r.score.toFixed(3)),
            text: r.text,
          }));
        const text =
          passages.length === 0
            ? `No passages in ${workspaceName}'s help center match "${query}" closely enough.`
            : passages
                .map((p, i) => `[${i + 1}] ${p.title}${p.page !== undefined ? `, page ${p.page}` : ''} (score ${p.score})\n${p.text}`)
                .join('\n\n');
        // content: text for the model to read. structuredContent: the same data as JSON, matching outputSchema.
        return { content: [{ type: 'text', text }], structuredContent: { passages } };
      } catch (err) {
        // A Gemini 429 or timeout while embedding the query: a tool error the client can show, not a crash.
        return { isError: true, content: [{ type: 'text', text: describeAiError(err, workspaceId) }] };
      }
    },
  );

  return server;
}

mcpRouter.post(
  '/',
  requireApiKey,
  rateLimit({ name: 'mcp-key', ...RATE_LIMITS.mcpPerKey, key: (_req, res) => (res.locals.mcp as McpLocals).apiKeyId }),
  async (req, res) => {
    const server = buildServer(res.locals.mcp as McpLocals);
    // sessionIdGenerator undefined = stateless. enableJsonResponse = answer with plain JSON instead of an event
    // stream: a search returns one result, and JSON is easy to debug with curl.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    // Typed as Node's plain request: our `req.auth` type is the dashboard session, which the SDK would read as
    // an OAuth token. MCP requests never pass through the dashboard login, so it's always unset here.
    await transport.handleRequest(req as IncomingMessage, res, req.body);
  },
);

// Stateless: there's no session to stream to (GET) or end (DELETE).
const methodNotAllowed: RequestHandler = (_req, res) => {
  res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
};
mcpRouter.get('/', methodNotAllowed);
mcpRouter.delete('/', methodNotAllowed);

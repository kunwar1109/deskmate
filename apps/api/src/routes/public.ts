import { SendMessageBody } from '@deskmate/shared/chat';
import type { WidgetConfig, WidgetConversation, WidgetSession } from '@deskmate/shared/widget';
import { pipeUIMessageStreamToResponse } from 'ai';
import { Router, type Request, type Response } from 'express';
import { RATE_LIMITS } from '../config.js';
import { workspaces } from '../db.js';
import { createConversation, findConversation, loadMessages, replyToMessage } from '../lib/conversations.js';
import { HttpError } from '../lib/errors.js';
import { toPublicStream, toWidgetMessage } from '../lib/public-messages.js';
import { byIp, checkRateLimit, rateLimit } from '../lib/rate-limit.js';
import { generateVisitorToken, hashToken, tokenMatches } from '../lib/widget.js';

/**
 * The API the embedded widget calls from customers' websites. Mounted at /api/public/w/:widgetKey.
 * No login: the widget key (public) picks the workspace, and a per-chat visitor token (secret) proves
 * a browser started that chat. The key is in the URL rather than a header so CORS preflight requests,
 * which carry no custom headers, can still be checked against the workspace's allowed origins.
 */
export const publicRouter = Router({ mergeParams: true });

interface WidgetContext {
  workspaceId: string;
  workspaceName: string;
}

function widgetContext(res: Response): WidgetContext {
  return res.locals.widget as WidgetContext;
}

// Flood protection first, before any database work.
publicRouter.use(rateLimit({ name: 'public-ip', ...RATE_LIMITS.publicRequestsPerIp, key: byIp }));

// Resolve the widget key, check the site embedding it, and answer CORS.
publicRouter.use(async (req: Request<{ widgetKey: string }>, res, next) => {
  const workspace = await workspaces.findOne({ 'widget.key': req.params.widgetKey }, { projection: { name: 1, widget: 1 } });
  if (!workspace?.widget) throw new HttpError(404, 'Unknown widget key');

  // Browsers always send Origin on cross-site requests, and pages can't fake it. That stops another website from
  // embedding this widget and spending this workspace's AI quota through its visitors. (A script outside a browser
  // can set any Origin; the rate limits handle those.)
  const origin = req.get('origin');
  const { allowedOrigins } = workspace.widget;
  if (origin) {
    // Set even when the origin is refused below: then the widget can read and show *why* (the owner forgot to add
    // "www.", say) instead of a bare network error. The refusal itself carries no data.
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); // the answer depends on Origin, so caches must not share it across sites
  }
  if (allowedOrigins.length > 0 && (!origin || !allowedOrigins.includes(origin))) {
    throw new HttpError(403, 'This website is not allowed to use this widget');
  }
  // No Access-Control-Allow-Credentials: the widget never sends cookies; it authenticates with its visitor token.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600'); // browsers reuse the preflight answer for 10 minutes
    res.status(204).end();
    return;
  }

  res.locals.widget = { workspaceId: workspace._id.toString(), workspaceName: workspace.name } satisfies WidgetContext;
  next();
});

/** Finds a widget chat, but only for the browser holding its visitor token. Anything else is a plain 404. */
async function findVisitorConversation(req: Request, res: Response) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const conversation = await findConversation(widgetContext(res).workspaceId, String(req.params.id));
  if (!token || !conversation.visitorTokenHash || !tokenMatches(token, conversation.visitorTokenHash)) {
    throw new HttpError(404, 'Conversation not found');
  }
  return conversation;
}

publicRouter.get('/', (_req, res) => {
  const body: WidgetConfig = { workspaceName: widgetContext(res).workspaceName };
  res.json(body);
});

publicRouter.post(
  '/conversations',
  rateLimit({ name: 'conversations-ip', ...RATE_LIMITS.conversationsPerIp, key: byIp }),
  async (_req, res) => {
    const visitorToken = generateVisitorToken();
    const conversation = await createConversation(widgetContext(res).workspaceId, 'widget', {
      visitorTokenHash: hashToken(visitorToken),
    });
    // The only time the token is sent. The server can't show it again: it only has the hash.
    const body: WidgetSession = { conversationId: conversation._id.toString(), visitorToken };
    res.status(201).json(body);
  },
);

publicRouter.get('/conversations/:id', async (req, res) => {
  const conversation = await findVisitorConversation(req, res);
  const body: WidgetConversation = {
    conversationId: conversation._id.toString(),
    messages: (await loadMessages(conversation._id)).map(toWidgetMessage),
  };
  res.json(body);
});

publicRouter.post(
  '/conversations/:id/messages',
  rateLimit({ name: 'messages-ip', ...RATE_LIMITS.messagesPerIp, key: byIp }),
  async (req, res) => {
    const { text } = SendMessageBody.parse(req.body);
    const conversation = await findVisitorConversation(req, res);
    // Counted only now, for a valid message in a real chat. If junk requests counted, anyone with the public
    // key could use up a company's hourly allowance without starting a chat, and lock its customers out.
    await checkRateLimit({ name: 'messages-workspace', ...RATE_LIMITS.messagesPerWorkspace }, conversation.workspaceId);
    const stream = await replyToMessage(conversation, text);
    pipeUIMessageStreamToResponse({ response: res, stream: toPublicStream(stream) });
  },
);

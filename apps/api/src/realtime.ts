import type { Server as HttpServer } from 'node:http';
import type { Conversation, ConversationStatus, DeskmateUIMessage } from '@deskmate/shared/chat';
import type { AgentServerEvents, VisitorServerEvents, VisitorSocketAuth } from '@deskmate/shared/realtime';
import { ObjectId } from 'mongodb';
import { Server, type Namespace, type Socket } from 'socket.io';
import { env, RATE_LIMITS } from './config.js';
import { conversations, workspaces } from './db.js';
import { readRealtimeTicket } from './lib/auth.js';
import { headerIp } from './lib/client-ip.js';
import { toWidgetMessage } from './lib/public-messages.js';
import { checkRateLimit } from './lib/rate-limit.js';
import { isOriginAllowed, tokenMatches } from './lib/widget.js';

/**
 * Live updates over Socket.io. Sockets only carry server-to-browser pushes; every write goes through the HTTP API.
 *
 * - /agents: dashboard users, one room per workspace. They see every widget chat of their workspace.
 * - /visitor: one widget, one room per chat, after the same visitor-token check as the HTTP API.
 *
 * One API process holds all sockets. With several instances, add the Socket.io Redis adapter so an event
 * published on one instance reaches sockets connected to another.
 */

const workspaceRoom = (workspaceId: string) => `workspace:${workspaceId}`;
const visitorRoom = (conversationId: string) => `visitor:${conversationId}`;

let agents: Namespace<Record<string, never>, AgentServerEvents> | undefined;
let visitors: Namespace<Record<string, never>, VisitorServerEvents> | undefined;

/** The client's IP from the handshake, worked out like byIp does for HTTP requests. */
function handshakeIp(socket: Socket): string {
  const fromHeader = headerIp(socket.handshake.headers);
  if (fromHeader) return fromHeader;
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (env.TRUST_PROXY_HOPS > 0 && typeof forwarded === 'string') {
    const hops = forwarded.split(',').map((ip) => ip.trim());
    return hops[Math.max(0, hops.length - env.TRUST_PROXY_HOPS)] ?? socket.handshake.address;
  }
  return socket.handshake.address;
}

export function initRealtime(server: HttpServer): Server {
  const io = new Server(server, {
    // Widgets connect from customers' sites. Neither side uses cookies on sockets (both send a token),
    // so accepting any origin here can't be abused like CSRF; each namespace checks its own proof below.
    cors: { origin: true },
    serveClient: false, // clients bundle socket.io-client themselves
  });

  agents = io.of('/agents');
  agents.use(async (socket, next) => {
    const auth = await readRealtimeTicket(socket.handshake.auth.token);
    if (!auth) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.workspaceId = auth.workspaceId;
    next();
  });
  agents.on('connection', (socket) => {
    void socket.join(workspaceRoom(socket.data.workspaceId as string));
  });

  visitors = io.of('/visitor');
  visitors.use(async (socket, next) => {
    try {
      // Each connection attempt costs two database lookups, so it's rate limited like the HTTP API.
      await checkRateLimit({ name: 'socket-ip', ...RATE_LIMITS.publicRequestsPerIp }, handshakeIp(socket));
      const { widgetKey, conversationId, visitorToken } = socket.handshake.auth as Partial<VisitorSocketAuth>;
      if (typeof widgetKey !== 'string' || typeof conversationId !== 'string' || typeof visitorToken !== 'string') {
        throw new Error('missing credentials');
      }
      const workspace = await workspaces.findOne({ 'widget.key': widgetKey }, { projection: { widget: 1 } });
      if (!workspace?.widget || !isOriginAllowed(workspace.widget.allowedOrigins, socket.handshake.headers.origin)) {
        throw new Error('widget not allowed');
      }
      const conversation = ObjectId.isValid(conversationId)
        ? await conversations.findOne({ _id: new ObjectId(conversationId), workspaceId: workspace._id.toString() })
        : null;
      if (!conversation?.visitorTokenHash || !tokenMatches(visitorToken, conversation.visitorTokenHash)) {
        throw new Error('conversation not found');
      }
      socket.data.conversationId = conversationId;
      next();
    } catch {
      next(new Error('unauthorized')); // one vague reason for every failure: don't help someone probe
    }
  });
  visitors.on('connection', (socket) => {
    void socket.join(visitorRoom(socket.data.conversationId as string));
  });

  return io;
}

/** A widget chat was created or changed (new message, status, title): refresh it in every agent's inbox. */
export function publishConversation(workspaceId: string, conversation: Conversation) {
  agents?.to(workspaceRoom(workspaceId)).emit('conversation:upsert', conversation);
}

/**
 * A message was saved. Agents get the full message (tool calls, scores). The visitor only gets messages
 * typed by a team member: their own messages and the bot's replies already reach them over HTTP.
 */
export function publishMessage(workspaceId: string, conversationId: string, message: DeskmateUIMessage) {
  agents?.to(workspaceRoom(workspaceId)).emit('message:new', { conversationId, message });
  if (message.metadata?.sender?.kind === 'human') {
    visitors?.to(visitorRoom(conversationId)).emit('message:new', toWidgetMessage(message));
  }
}

/** Tells the visitor's widget whether a person or the bot is handling their chat now. */
export function publishStatus(conversationId: string, status: ConversationStatus) {
  visitors?.to(visitorRoom(conversationId)).emit('conversation:status', { status });
}

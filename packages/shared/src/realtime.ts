import type { Conversation, ConversationStatus, DeskmateUIMessage } from '@deskmate/shared/chat';
import type { WidgetUIMessage } from '@deskmate/shared/widget';

/**
 * Socket.io event contracts. The server only pushes over sockets; every write (replies, status changes,
 * customer messages) goes through the HTTP API, so validation and auth live in one place.
 */

/** Pushed to dashboard agents of one workspace (namespace /agents). */
export interface AgentServerEvents {
  'conversation:upsert': (conversation: Conversation) => void; // created, new message, status changed
  'message:new': (event: { conversationId: string; message: DeskmateUIMessage }) => void;
}

/** Pushed to one visitor's widget (namespace /visitor). Only what the customer may see. */
export interface VisitorServerEvents {
  'message:new': (message: WidgetUIMessage) => void; // replies from a team member
  'conversation:status': (event: { status: ConversationStatus }) => void;
}

/** What the widget sends when connecting: the same proof as its HTTP calls. */
export interface VisitorSocketAuth {
  widgetKey: string;
  conversationId: string;
  visitorToken: string;
}

/** GET /api/realtime/token: a short-lived token for the dashboard's socket, and where to connect. */
export interface RealtimeTicket {
  token: string;
  url: string;
}

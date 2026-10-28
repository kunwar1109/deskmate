import type { UIMessage } from 'ai';
import { z } from 'zod';

/**
 * An origin is scheme + host + port, exactly as browsers send it in the Origin header:
 * "https://brewbox.com" or "http://localhost:5173". No path and no trailing slash.
 */
const Origin = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
    } catch {
      return false;
    }
  }, 'Use an origin like https://example.com (no path or trailing slash)');

export const AllowedOriginsBody = z.object({
  allowedOrigins: z.array(Origin).max(20, 'At most 20 origins'),
});
export type AllowedOriginsInput = z.input<typeof AllowedOriginsBody>;

/** What the owner sees in the dashboard. */
export interface WidgetSettings {
  key: string; // public: it goes in the embed snippet on the customer's site
  allowedOrigins: string[]; // empty = any site may embed the widget
}

/** GET /api/public/w/:key: what the widget needs before the first message. */
export interface WidgetConfig {
  workspaceName: string;
}

/** Returned once when a visitor starts a chat. The widget keeps the token to continue the chat later. */
export interface WidgetSession {
  conversationId: string;
  visitorToken: string;
}

/** A source the customer can see: no similarity score, no document id, no passage text. */
export interface CitedSource {
  n: number;
  title: string;
  page?: number;
}

export interface WidgetMessageMetadata {
  createdAt?: number;
  handedOff?: boolean; // the reply passed the chat to a human
}

/**
 * The customer-facing version of a chat message: text, plus a `data-sources` part per search so
 * [n] markers can show source titles. Tool calls, scores, usage and the team's handoff note are
 * stripped on the server before anything reaches the widget.
 */
export type WidgetUIMessage = UIMessage<WidgetMessageMetadata, { sources: CitedSource[] }>;

export interface WidgetConversation {
  conversationId: string;
  messages: WidgetUIMessage[];
}

import type { UIDataTypes, UIMessage } from 'ai';
import { z } from 'zod';

/**
 * The client sends only the new message's text. The server loads the history itself, so a client
 * can't rewrite earlier messages or forge tool results.
 */
export const SendMessageBody = z.object({
  text: z.string().trim().min(1, 'Type a message').max(2000, 'Message is too long'),
});
export type SendMessageInput = z.input<typeof SendMessageBody>;

/** What the customer sees whenever the bot hands off. Fixed text, never model-written. */
export const HANDOFF_MESSAGE =
  "I'd like a member of our team to help with this, so I'm passing your chat to them. Someone will reply here shortly.";

/**
 * Why the bot handed the chat to a human:
 * - not_in_docs: it searched and the help docs don't answer the question
 * - customer_requested: the customer asked for a person
 * - needs_human: a judgment call the bot shouldn't make (refund disputes, complaints, account changes)
 * - agent_failed: the agent ended without a usable answer (e.g. hit its step limit)
 */
export type HandoffReason = 'not_in_docs' | 'customer_requested' | 'needs_human' | 'agent_failed';

/** One passage the agent was shown. `n` matches the [n] citation markers in the answer text. */
export interface Passage {
  n: number;
  documentId: string;
  title: string;
  page?: number;
  score: number; // 0..1 vector similarity
  text: string;
}

export interface SearchDocsOutput {
  found: boolean;
  bestScore: number | null; // best match before the MIN_RELEVANCE filter, so the owner sees near misses
  passages: Passage[];
}

export interface OrderDetails {
  orderId: string;
  status: 'processing' | 'shipped' | 'delivered';
  plan: string;
  placedOn: string;
  estimatedDelivery?: string;
  trackingUrl?: string;
}

export type LookupOrderOutput = { found: true; order: OrderDetails } | { found: false; message: string };

/**
 * Input and output of each agent tool, as they appear in streamed and stored messages.
 * The API annotates its tools' execute functions with these output types, so the two can't drift apart.
 * A type alias, not an interface: only aliases are assignable to the SDK's Record-based UITools.
 */
export type DeskmateTools = {
  searchDocs: { input: { query: string }; output: SearchDocsOutput };
  lookupOrder: { input: { orderId: string; email: string }; output: LookupOrderOutput };
  createTicket: {
    input: { subject: string; summary: string; customerEmail: string };
    output: { ticketNumber: string };
  };
  handoffToHuman: {
    input: { reason: Exclude<HandoffReason, 'agent_failed'>; summary: string };
    output: { message: string }; // the fixed message the customer sees
  };
};

/** A reply written by a person on the team, not the bot. */
export interface HumanSender {
  kind: 'human';
  name: string;
}

/** Facts about an assistant reply, sent when it starts and finishes streaming. */
export interface MessageMetadata {
  createdAt?: number; // epoch ms
  latencyMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  // Best retrieval score across this reply's searches. Logged so MIN_RELEVANCE can be tuned.
  topScore?: number | null;
  handoffReason?: HandoffReason; // set when this reply handed the chat to a human
  sender?: HumanSender; // set on replies typed by a team member in the inbox; absent = the bot
}

/** A chat message as the AI SDK streams it, stores it and renders it: text parts plus typed tool parts. */
export type DeskmateUIMessage = UIMessage<MessageMetadata, UIDataTypes, DeskmateTools>;

/**
 * - open: the bot is answering
 * - handed_off: a person is needed or has taken over; the bot stays quiet in widget chats
 * - closed: resolved by the team; a new customer message reopens it with the bot
 */
export type ConversationStatus = 'open' | 'handed_off' | 'closed';

/** A team member's reply from the inbox. */
export const HumanReplyBody = z.object({
  text: z.string().trim().min(1, 'Type a reply').max(4000, 'Reply is too long'),
});
export type HumanReplyInput = z.input<typeof HumanReplyBody>;

/** Inbox actions: "hand back to the bot" (open) or "close". handed_off is set by a handoff or a human reply. */
export const ConversationStatusBody = z.object({ status: z.enum(['open', 'closed']) });
export type ConversationStatusInput = z.input<typeof ConversationStatusBody>;

export const ConversationListQuery = z.object({
  status: z.enum(['open', 'handed_off', 'closed']).optional(),
});

export interface Conversation {
  id: string;
  channel: 'playground' | 'widget'; // dashboard test chat, or a real customer on the embedded widget
  status: ConversationStatus;
  title: string; // the first customer message, shortened
  handoffReason?: HandoffReason;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: DeskmateUIMessage[];
}

import { z } from 'zod';

export const ChatBody = z.object({
  question: z.string().trim().min(1, 'Ask a question').max(2000, 'Question is too long'),
});
export type ChatInput = z.input<typeof ChatBody>;

/** One passage the agent was shown. `n` matches the [n] citation markers in the answer text. */
export interface Source {
  n: number;
  documentId: string;
  title: string;
  page?: number;
  score: number; // 0..1 vector similarity
  snippet: string;
  cited: boolean; // the answer actually referenced [n]
}

/**
 * Why the bot handed the chat to a human:
 * - not_in_docs: it searched and the help docs don't answer the question
 * - customer_requested: the customer asked for a person
 * - needs_human: a judgment call the bot shouldn't make (refund disputes, complaints, account changes)
 * - agent_failed: the agent ended without a usable answer (e.g. hit its step limit)
 */
export type HandoffReason = 'not_in_docs' | 'customer_requested' | 'needs_human' | 'agent_failed';

/** One tool the agent used while answering, for the playground's "how it answered" trace. */
export interface ToolCallTrace {
  tool: 'searchDocs' | 'lookupOrder' | 'createTicket' | 'handoffToHuman';
  input: Record<string, unknown>;
  summary: string; // e.g. "3 passages (best 0.820)" or "order not found"
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  handoff: boolean; // true = the bot couldn't answer confidently; phase 3 routes this to a human
  handoffReason?: HandoffReason;
  handoffSummary?: string; // the agent's one-line note for the human who takes over
  // Best retrieval score across all searches, before the MIN_RELEVANCE filter. Logged so the threshold can be tuned.
  topScore: number | null;
  toolCalls: ToolCallTrace[];
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs: number;
}

import { z } from 'zod';

export const ChatBody = z.object({
  question: z.string().trim().min(1, 'Ask a question').max(2000, 'Question is too long'),
});
export type ChatInput = z.input<typeof ChatBody>;

/** One retrieved passage. `n` matches the [n] citation markers in the answer text. */
export interface Source {
  n: number;
  documentId: string;
  title: string;
  page?: number;
  score: number; // 0..1 vector similarity
  snippet: string;
  cited: boolean; // the answer actually referenced [n]
}

export type HandoffReason = 'low_relevance' | 'no_answer';

export interface ChatResponse {
  answer: string;
  sources: Source[];
  handoff: boolean; // true = the bot couldn't answer confidently; phase 3 routes this to a human
  // Which guardrail caused the handoff: 'low_relevance' = guardrail 1 (retrieval), 'no_answer' = guardrail 2 (model).
  handoffReason?: HandoffReason;
  // Best retrieval score, kept even on handoff (when sources is empty). Logged so MIN_RELEVANCE can be tuned.
  topScore: number | null;
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs: number;
}

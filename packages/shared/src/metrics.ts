import { z } from 'zod';
import type { ConversationStatus, HandoffReason } from '@deskmate/shared/chat';

/** GET /api/metrics?days=7: how many days back to look, counting from now. */
export const MetricsQuery = z.object({
  days: z.coerce.number().int().min(1, 'At least 1 day').max(90, 'At most 90 days').default(7),
});
export type MetricsQueryInput = z.input<typeof MetricsQuery>;

export interface TokenCount {
  input: number;
  output: number;
}

/** Spend and speed of one conversation's bot replies in the period. */
export interface ConversationUsage {
  id: string;
  title: string;
  channel: 'playground' | 'widget';
  status: ConversationStatus;
  botReplies: number;
  tokens: TokenCount;
  estimatedCostUsd: number | null; // null: no price on file for the chat model
  avgLatencyMs: number | null;
  lastReplyAt: string;
}

/**
 * The workspace's support numbers for a period. Counts bot replies only (not team members' replies),
 * and only replies that finished: a reply that failed mid-stream isn't stored, so its tokens aren't counted.
 */
export interface WorkspaceMetrics {
  days: number;
  since: string;
  conversations: { total: number; widget: number; playground: number };
  botReplies: number;
  humanReplies: number;
  handoffs: { total: number; byReason: Partial<Record<HandoffReason, number>> };
  latencyMs: { median: number | null; p95: number | null }; // null when there were no replies
  tokens: TokenCount;
  /** Chat model tokens at the paid tier's list price. The free tier costs nothing; this is what the traffic would cost. */
  cost: { model: string; estimatedUsd: number | null; inputPerMillionUsd: number | null; outputPerMillionUsd: number | null };
  recent: ConversationUsage[]; // the 20 conversations with the most recent bot replies
}

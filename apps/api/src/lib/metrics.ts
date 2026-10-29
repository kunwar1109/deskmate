import type { HandoffReason } from '@deskmate/shared/chat';
import type { ConversationUsage, WorkspaceMetrics } from '@deskmate/shared/metrics';
import type { ObjectId } from 'mongodb';
import { env } from '../config.js';
import { conversations, messages } from '../db.js';
import { chatPrice, estimateCostUsd } from './cost.js';

const RECENT_CONVERSATIONS = 20;

interface Totals {
  replies: number;
  input: number;
  output: number;
  latency: (number | null)[]; // [median, p95]
}

interface PerConversation {
  _id: ObjectId;
  replies: number;
  input: number;
  output: number;
  avgLatency: number | null;
  last: Date;
}

/**
 * The workspace's numbers for the last `days` days, computed by MongoDB from the stored replies: every bot
 * reply already carries its latency and token usage (metadata saved in onEnd), so nothing extra is logged.
 * One $facet runs the three groupings over a single scan of the period's replies.
 */
export async function getWorkspaceMetrics(workspaceId: string, days: number): Promise<WorkspaceMetrics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Bot replies only: a team member's reply has metadata.sender and costs no tokens.
  const botReplies = { workspaceId, role: 'assistant' as const, createdAt: { $gte: since }, 'metadata.sender': { $exists: false } };
  const tokens = (field: 'inputTokens' | 'outputTokens') => ({ $sum: { $ifNull: [`$metadata.usage.${field}`, 0] } });

  const [replyStats, conversationCounts, humanReplies] = await Promise.all([
    messages
      .aggregate<{ totals: Totals[]; handoffs: { _id: HandoffReason; n: number }[]; perConversation: PerConversation[] }>([
        { $match: botReplies },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  replies: { $sum: 1 },
                  input: tokens('inputTokens'),
                  output: tokens('outputTokens'),
                  // Median and 95th percentile: the average hides the slow replies customers notice.
                  // 'approximate' is the method MongoDB supports; exact enough for a dashboard.
                  latency: { $percentile: { input: '$metadata.latencyMs', p: [0.5, 0.95], method: 'approximate' } },
                },
              },
            ],
            handoffs: [
              { $match: { 'metadata.handoffReason': { $exists: true } } },
              { $group: { _id: '$metadata.handoffReason', n: { $sum: 1 } } },
            ],
            perConversation: [
              {
                $group: {
                  _id: '$conversationId',
                  replies: { $sum: 1 },
                  input: tokens('inputTokens'),
                  output: tokens('outputTokens'),
                  avgLatency: { $avg: '$metadata.latencyMs' },
                  last: { $max: '$createdAt' },
                },
              },
              { $sort: { last: -1 } },
              { $limit: RECENT_CONVERSATIONS },
            ],
          },
        },
      ])
      .next(),
    conversations
      .aggregate<{ _id: 'playground' | 'widget'; n: number }>([
        { $match: { workspaceId, createdAt: { $gte: since } } },
        { $group: { _id: '$channel', n: { $sum: 1 } } },
      ])
      .toArray(),
    messages.countDocuments({ workspaceId, role: 'assistant', createdAt: { $gte: since }, 'metadata.sender': { $exists: true } }),
  ]);

  const totals = replyStats?.totals[0];
  const perConversation = replyStats?.perConversation ?? [];
  const byChannel = Object.fromEntries(conversationCounts.map(({ _id, n }) => [_id, n]));
  const byReason = Object.fromEntries((replyStats?.handoffs ?? []).map(({ _id, n }) => [_id, n]));
  const totalTokens = { input: totals?.input ?? 0, output: totals?.output ?? 0 };
  const price = chatPrice();

  // Titles and status for the recent list. Filtered by workspaceId too, though the ids already came from it.
  const conversationDocs = await conversations
    .find({ workspaceId, _id: { $in: perConversation.map((c) => c._id) } })
    .project<{ _id: ObjectId; title: string; channel: 'playground' | 'widget'; status: ConversationUsage['status'] }>({
      title: 1,
      channel: 1,
      status: 1,
    })
    .toArray();
  const byId = new Map(conversationDocs.map((doc) => [doc._id.toString(), doc]));

  const recent = perConversation.flatMap((c): ConversationUsage[] => {
    const doc = byId.get(c._id.toString());
    if (!doc) return []; // deleted since
    const usage = { input: c.input, output: c.output };
    return [
      {
        id: doc._id.toString(),
        title: doc.title,
        channel: doc.channel,
        status: doc.status,
        botReplies: c.replies,
        tokens: usage,
        estimatedCostUsd: estimateCostUsd(usage),
        avgLatencyMs: c.avgLatency === null ? null : Math.round(c.avgLatency),
        lastReplyAt: c.last.toISOString(),
      },
    ];
  });

  const round = (value: number | null | undefined) => (value == null ? null : Math.round(value));
  return {
    days,
    since: since.toISOString(),
    conversations: {
      total: (byChannel.widget ?? 0) + (byChannel.playground ?? 0),
      widget: byChannel.widget ?? 0,
      playground: byChannel.playground ?? 0,
    },
    botReplies: totals?.replies ?? 0,
    humanReplies,
    handoffs: { total: Object.values(byReason).reduce((sum, n) => sum + n, 0), byReason },
    latencyMs: { median: round(totals?.latency[0]), p95: round(totals?.latency[1]) },
    tokens: totalTokens,
    cost: {
      model: env.CHAT_MODEL,
      estimatedUsd: estimateCostUsd(totalTokens),
      inputPerMillionUsd: price?.input ?? null,
      outputPerMillionUsd: price?.output ?? null,
    },
    recent,
  };
}

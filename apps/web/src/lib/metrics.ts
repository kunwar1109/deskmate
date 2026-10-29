import type { WorkspaceMetrics } from "@deskmate/shared/metrics";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export const PERIODS = [1, 7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function useMetrics(days: Period) {
  return useQuery({
    queryKey: ["metrics", days],
    queryFn: () => apiFetch<WorkspaceMetrics>(`/metrics?days=${days}`),
    refetchInterval: 60_000, // new replies keep arriving; a minute is fresh enough for these numbers
  });
}

/**
 * Dollars for tiny amounts: one reply costs a fraction of a cent, so "$0.00" would hide everything.
 * Two significant digits below $1 ("$0.0012"), cents above ("$12.40").
 */
export function formatUsd(amount: number | null): string {
  if (amount === null) return "–";
  if (amount === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    ...(amount < 1 ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }).format(amount);
}

/** "850 ms", "2.4 s". */
export function formatLatency(ms: number | null): string {
  if (ms === null) return "–";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "980", "12.3K", "1.2M". */
export function formatTokens(count: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

/** Share of bot replies that handed the chat to a person, e.g. "12%". */
export function handoffRate(metrics: Pick<WorkspaceMetrics, "botReplies" | "handoffs">): string {
  if (metrics.botReplies === 0) return "–";
  return `${Math.round((metrics.handoffs.total / metrics.botReplies) * 100)}%`;
}

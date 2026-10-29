"use client";

import type { HandoffReason } from "@deskmate/shared/chat";
import type { WorkspaceMetrics } from "@deskmate/shared/metrics";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { formatLatency, formatTokens, formatUsd, handoffRate, PERIODS, useMetrics, type Period } from "@/lib/metrics";

const PERIOD_LABEL: Record<Period, string> = { 1: "24 hours", 7: "7 days", 30: "30 days", 90: "90 days" };

const REASON_LABEL: Record<HandoffReason, string> = {
  not_in_docs: "not in the docs",
  customer_requested: "customer asked",
  needs_human: "needs a person",
  agent_failed: "agent failed",
};

/** The overview's numbers: volume, handoffs, speed and spend, for a chosen period. */
export function MetricsOverview() {
  const [days, setDays] = useState<Period>(7);
  const { data, isPending, error } = useMetrics(days);

  return (
    <section className="space-y-4" aria-labelledby="metrics-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="metrics-heading" className="text-lg font-semibold">
          Last {PERIOD_LABEL[days]}
        </h2>
        <div className="flex gap-1" role="group" aria-label="Period">
          {PERIODS.map((period) => (
            <Button
              key={period}
              size="sm"
              variant={period === days ? "secondary" : "ghost"}
              aria-pressed={period === days}
              onClick={() => setDays(period)}
            >
              {PERIOD_LABEL[period]}
            </Button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading numbers">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : (
        <>
          <StatCards metrics={data} />
          <RecentConversations metrics={data} />
        </>
      )}
    </section>
  );
}

function StatCards({ metrics }: { metrics: WorkspaceMetrics }) {
  const reasons = Object.entries(metrics.handoffs.byReason)
    .map(([reason, n]) => `${n} ${REASON_LABEL[reason as HandoffReason]}`)
    .join(", ");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Conversations"
        value={String(metrics.conversations.total)}
        detail={`${metrics.conversations.widget} from customers, ${metrics.conversations.playground} test chats`}
      />
      <Stat
        label="Handed to a person"
        value={handoffRate(metrics)}
        detail={
          metrics.botReplies === 0
            ? "No bot replies yet"
            : `${metrics.handoffs.total} of ${metrics.botReplies} bot replies${reasons ? `: ${reasons}` : ""}`
        }
      />
      <Stat
        label="Response time (median)"
        value={formatLatency(metrics.latencyMs.median)}
        detail={`95% of replies within ${formatLatency(metrics.latencyMs.p95)}`}
      />
      <Stat
        label="Estimated AI cost"
        value={formatUsd(metrics.cost.estimatedUsd)}
        detail={
          <>
            {formatTokens(metrics.tokens.input)} tokens in, {formatTokens(metrics.tokens.output)} out, at {metrics.cost.model}
            &apos;s paid-tier price. The free tier costs $0.
          </>
        }
      />
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

function RecentConversations({ metrics }: { metrics: WorkspaceMetrics }) {
  if (metrics.recent.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No bot replies in this period. Ask something in the Test chat to see numbers here.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent conversations</CardTitle>
        <CardDescription>Bot replies only. Failed replies aren&apos;t stored, so their tokens aren&apos;t counted.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conversation</TableHead>
              <TableHead className="text-right">Bot replies</TableHead>
              <TableHead className="text-right">Avg response</TableHead>
              <TableHead className="text-right">Tokens in / out</TableHead>
              <TableHead className="text-right">Est. cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.recent.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-xs">
                  <Link
                    href={c.channel === "widget" ? `/dashboard/inbox?c=${c.id}` : `/dashboard/playground?c=${c.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {c.title}
                  </Link>
                  <Badge variant="outline" className="mt-1">
                    {c.channel === "widget" ? "Customer" : "Test chat"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.botReplies}</TableCell>
                <TableCell className="text-right tabular-nums">{formatLatency(c.avgLatencyMs)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatTokens(c.tokens.input)} / {formatTokens(c.tokens.output)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatUsd(c.estimatedCostUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

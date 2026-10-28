"use client";

import type { ChatResponse, HandoffReason, Source, ToolCallTrace } from "@deskmate/shared/chat";
import { FileSearchIcon, PackageIcon, TicketIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { parseCitations } from "@/lib/chat";
import { cn } from "@/lib/utils";

// Owner-facing explanations: the customer only ever sees the polite handoff message.
const HANDOFF_EXPLANATION: Record<HandoffReason, string> = {
  not_in_docs:
    "The agent searched your docs and they don't answer this, so it refused to guess. Add a document that covers it.",
  customer_requested: "The customer asked to talk to a person.",
  needs_human: "This needs a judgment call (a dispute, complaint or account change), so the agent passed it on.",
  agent_failed: "The agent ended without an answer, for example by hitting its step limit.",
};

const TOOL_ICON: Record<ToolCallTrace["tool"], LucideIcon> = {
  searchDocs: FileSearchIcon,
  lookupOrder: PackageIcon,
  createTicket: TicketIcon,
  handoffToHuman: UserRoundIcon,
};

export function AnswerCard({ turnId, response }: { turnId: string; response: ChatResponse }) {
  const [active, setActive] = useState<number | null>(null);
  const sourceNumbers = new Set(response.sources.map((s) => s.n));
  const sourceId = (n: number) => `${turnId}-source-${n}`;

  function focusSource(n: number) {
    setActive(n);
    document.getElementById(sourceId(n))?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="space-y-4">
      <p className="leading-relaxed whitespace-pre-line">
        {parseCitations(response.answer, sourceNumbers).map((part, i) =>
          part.type === "text" ? (
            <span key={i}>{part.text}</span>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => focusSource(part.n)}
              className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary/10 px-1 align-text-top text-xs font-medium text-primary hover:bg-primary/20"
              aria-label={`Show source ${part.n}`}
            >
              {part.n}
            </button>
          ),
        )}
      </p>

      {response.handoff && (
        <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <UserRoundIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Handed off to a human</p>
            {response.handoffReason && <p>{HANDOFF_EXPLANATION[response.handoffReason]}</p>}
            {response.handoffSummary && <p className="mt-1 italic">Note for your team: {response.handoffSummary}</p>}
            <p className="mt-1 text-amber-800">
              Best match score: {response.topScore === null ? "no passages found" : response.topScore.toFixed(3)}
            </p>
          </div>
        </div>
      )}

      {response.toolCalls.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">How it answered</p>
          <ol className="space-y-1 text-sm">
            {response.toolCalls.map((call, i) => (
              <ToolCallRow key={i} call={call} />
            ))}
          </ol>
        </div>
      )}

      {response.sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Passages the agent was shown</p>
          {response.sources.map((source) => (
            <SourceCard key={source.n} id={sourceId(source.n)} source={source} highlighted={active === source.n} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {(response.latencyMs / 1000).toFixed(1)}s
        {response.usage?.inputTokens !== undefined &&
          ` · ${response.usage.inputTokens} in / ${response.usage.outputTokens ?? 0} out tokens`}
      </p>
    </div>
  );
}

function ToolCallRow({ call }: { call: ToolCallTrace }) {
  const Icon = TOOL_ICON[call.tool];
  const detail = Object.values(call.input).filter((v) => typeof v === "string").join(" · ");
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <code className="text-xs font-medium">{call.tool}</code>
        {detail && <span className="text-muted-foreground"> “{detail}”</span>}
        <span className="text-muted-foreground"> → {call.summary}</span>
      </span>
    </li>
  );
}

function SourceCard({ id, source, highlighted }: { id: string; source: Source; highlighted: boolean }) {
  return (
    <div
      id={id}
      className={cn("rounded-md border p-3 text-sm transition-colors", highlighted && "border-primary bg-primary/5")}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">[{source.n}]</span>
        <span className="truncate">
          {source.title}
          {source.page !== undefined && <span className="text-muted-foreground"> · page {source.page}</span>}
        </span>
        {source.cited ? <Badge variant="secondary">Cited</Badge> : <Badge variant="outline">Not cited</Badge>}
        <ScoreBar score={source.score} />
      </div>
      <p className="line-clamp-3 text-muted-foreground">{source.snippet}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground" title="Vector similarity, 0 to 1">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(score * 100)}%` }} />
      </span>
      {score.toFixed(3)}
    </span>
  );
}

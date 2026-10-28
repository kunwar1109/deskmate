"use client";

import { HANDOFF_MESSAGE, type DeskmateUIMessage, type HandoffReason, type Passage } from "@deskmate/shared/chat";
import {
  FileSearchIcon,
  Loader2Icon,
  PackageIcon,
  TicketIcon,
  TriangleAlertIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messagePassages, messageText, parseCitations } from "@/lib/chat";
import { cn } from "@/lib/utils";

// Owner-facing explanations: the customer only ever sees the polite handoff message.
const HANDOFF_EXPLANATION: Record<HandoffReason, string> = {
  not_in_docs:
    "The agent searched your docs and they don't answer this, so it refused to guess. Add a document that covers it.",
  customer_requested: "The customer asked to talk to a person.",
  needs_human: "This needs a judgment call (a dispute, complaint or account change), so the agent passed it on.",
  agent_failed: "The agent ended without an answer, for example by hitting its step limit.",
};

type ToolPart = Extract<DeskmateUIMessage["parts"][number], { type: `tool-${string}` }>;

interface ToolStep {
  icon: LucideIcon;
  label: string; // what the agent is doing, e.g. Searching docs for "pause plan"
  result?: string; // what came back, once the tool has finished
  failed?: boolean;
}

/** One line per tool call. Inputs arrive while streaming, so every field may still be missing. */
function describeToolPart(part: ToolPart): ToolStep {
  const done = part.state === "output-available";
  const failed = part.state === "output-error";
  const step = (icon: LucideIcon, label: string, result?: string): ToolStep =>
    failed ? { icon, label, result: part.errorText, failed } : { icon, label, ...(done ? { result } : {}) };

  switch (part.type) {
    case "tool-searchDocs": {
      const output = done ? part.output : undefined;
      const best = output?.bestScore == null ? "" : ` (best ${output.bestScore.toFixed(3)})`;
      return step(
        FileSearchIcon,
        `Searched docs for “${part.input?.query ?? "…"}”`,
        output && (output.found ? `${output.passages.length} passage(s)${best}` : `no relevant passages${best}`),
      );
    }
    case "tool-lookupOrder":
      return step(
        PackageIcon,
        `Looked up order ${part.input?.orderId ?? "…"}`,
        done ? (part.output.found ? `found, ${part.output.order.status}` : "not found") : undefined,
      );
    case "tool-createTicket":
      return step(TicketIcon, "Created a ticket", done ? part.output.ticketNumber : undefined);
    case "tool-handoffToHuman":
      return step(UserRoundIcon, "Handed off to a human", done ? part.input.reason : undefined);
  }
}

export function AssistantMessage({ message, streaming }: { message: DeskmateUIMessage; streaming: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const text = messageText(message);
  const passages = messagePassages(message);
  const toolParts = message.parts.filter((part): part is ToolPart => part.type.startsWith("tool-"));
  const handoffPart = message.parts.find((part) => part.type === "tool-handoffToHuman");
  const handoffReason = message.metadata?.handoffReason;
  const metadata = message.metadata;

  const sourceNumbers = new Set(passages.map((p) => p.n));
  const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const sourceId = (n: number) => `${message.id}-source-${n}`;

  function focusSource(n: number) {
    setActive(n);
    document.getElementById(sourceId(n))?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // While tools run and before the first word arrives, say what the agent is doing right now.
  const current = toolParts.at(-1);
  const activity = current && current.state !== "output-available" ? describeToolPart(current).label : "Thinking";

  return (
    <div className="space-y-4">
      {text && (
        <p className="leading-relaxed whitespace-pre-line">
          {parseCitations(text, sourceNumbers).map((part, i) =>
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
      )}

      {handoffReason && <p className="leading-relaxed">{handoffPart?.state === "output-available" ? handoffPart.output.message : HANDOFF_MESSAGE}</p>}

      {streaming && !text && !handoffReason && (
        <p className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
          <Loader2Icon className="size-4 animate-spin" aria-hidden /> {activity}…
        </p>
      )}

      {!streaming && !text && !handoffReason && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlertIcon className="size-4" aria-hidden /> This reply didn&apos;t finish. Send your message again.
        </p>
      )}

      {handoffReason && (
        <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <UserRoundIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Handed off to a human</p>
            <p>{HANDOFF_EXPLANATION[handoffReason]}</p>
            {handoffPart?.input?.summary && <p className="mt-1 italic">Note for your team: {handoffPart.input.summary}</p>}
            {metadata?.topScore !== undefined && (
              <p className="mt-1 text-amber-800">
                Best match score: {metadata.topScore === null ? "no passages found" : metadata.topScore.toFixed(3)}
              </p>
            )}
          </div>
        </div>
      )}

      {toolParts.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">How it answered</p>
          <ol className="space-y-1 text-sm">
            {toolParts.map((part) => (
              <ToolStepRow key={part.toolCallId} step={describeToolPart(part)} />
            ))}
          </ol>
        </div>
      )}

      {passages.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Passages the agent was shown</p>
          {passages.map((passage) => (
            <SourceCard
              key={passage.n}
              id={sourceId(passage.n)}
              passage={passage}
              cited={cited.has(passage.n)}
              done={!streaming}
              highlighted={active === passage.n}
            />
          ))}
        </div>
      )}

      {metadata?.latencyMs !== undefined && (
        <p className="text-xs text-muted-foreground">
          {(metadata.latencyMs / 1000).toFixed(1)}s
          {metadata.usage?.inputTokens !== undefined &&
            ` · ${metadata.usage.inputTokens} in / ${metadata.usage.outputTokens ?? 0} out tokens`}
        </p>
      )}
    </div>
  );
}

function ToolStepRow({ step }: { step: ToolStep }) {
  const Icon = step.icon;
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        {step.label}
        {step.result === undefined ? (
          <Loader2Icon className="ml-2 inline size-3 animate-spin text-muted-foreground" aria-label="running" />
        ) : (
          <span className={step.failed ? "text-destructive" : "text-muted-foreground"}> → {step.result}</span>
        )}
      </span>
    </li>
  );
}

interface SourceCardProps {
  id: string;
  passage: Passage;
  cited: boolean;
  done: boolean; // "Not cited" is only true once the answer has finished
  highlighted: boolean;
}

function SourceCard({ id, passage, cited, done, highlighted }: SourceCardProps) {
  return (
    <div
      id={id}
      className={cn("rounded-md border p-3 text-sm transition-colors", highlighted && "border-primary bg-primary/5")}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">[{passage.n}]</span>
        <span className="truncate">
          {passage.title}
          {passage.page !== undefined && <span className="text-muted-foreground"> · page {passage.page}</span>}
        </span>
        {cited ? <Badge variant="secondary">Cited</Badge> : done && <Badge variant="outline">Not cited</Badge>}
        <ScoreBar score={passage.score} />
      </div>
      <p className="line-clamp-3 text-muted-foreground">{passage.text}</p>
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

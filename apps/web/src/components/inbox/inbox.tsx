"use client";

import { HumanReplyBody, type Conversation, type DeskmateUIMessage } from "@deskmate/shared/chat";
import { BotIcon, CheckCheckIcon, Loader2Icon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { AssistantMessage } from "@/components/playground/assistant-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { messageText, useConversation } from "@/lib/chat";
import { STATUS_LABEL, timeAgo, useInbox, useReply, useSetStatus, type InboxFilter } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const TABS: { filter: InboxFilter; label: string }[] = [
  { filter: "needs_human", label: "Needs a human" },
  { filter: "all", label: "All" },
  { filter: "closed", label: "Closed" },
];

/** Customer chats from the widget. The list and the open chat update live over the socket. */
export function Inbox() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("c");
  const [filter, setFilter] = useState<InboxFilter>("needs_human");

  return (
    // A fixed height, like a mail client: the list and the chat scroll on their own, and the reply box stays in view.
    <div className="grid gap-4 md:h-[calc(100dvh-13rem)] md:min-h-[480px] md:grid-cols-[280px_1fr]">
      <aside className="flex min-h-0 flex-col gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Filter conversations">
          {TABS.map((tab) => (
            <button
              key={tab.filter}
              type="button"
              role="tab"
              aria-selected={filter === tab.filter}
              onClick={() => setFilter(tab.filter)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted",
                filter === tab.filter && "bg-muted font-medium text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList filter={filter} selectedId={selectedId} />
        </div>
      </aside>
      <section className="flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-lg border md:min-h-0">
        {selectedId ? (
          <ConversationPanel key={selectedId} id={selectedId} />
        ) : (
          <p className="p-10 text-center text-muted-foreground">Pick a conversation to read and reply.</p>
        )}
      </section>
    </div>
  );
}

function ConversationList({ filter, selectedId }: { filter: InboxFilter; selectedId: string | null }) {
  const { data, isPending, error } = useInbox(filter);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {filter === "needs_human"
          ? "Nobody is waiting. Chats the bot hands off appear here instantly."
          : "No customer chats yet. Put the widget on your site from the Widget page."}
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {data.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/dashboard/inbox?c=${conversation.id}`}
            scroll={false}
            aria-current={conversation.id === selectedId ? "page" : undefined}
            className={cn(
              "block rounded-md border px-3 py-2 hover:bg-muted",
              conversation.id === selectedId && "border-primary bg-muted",
            )}
          >
            <p className="truncate text-sm font-medium">{conversation.title}</p>
            <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <StatusBadge status={conversation.status} />
              {timeAgo(conversation.updatedAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: Conversation["status"] }) {
  const variant = status === "handed_off" ? "destructive" : status === "open" ? "secondary" : "outline";
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

function ConversationPanel({ id }: { id: string }) {
  const { data, isPending, error } = useConversation(id);
  const setStatus = useSetStatus(id);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = data?.messages.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount]);

  if (isPending) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-6 text-sm text-destructive">{errorMessage(error)}</p>;

  const { conversation, messages } = data;
  function changeStatus(status: "open" | "closed") {
    setStatus.mutate(
      { status },
      {
        onSuccess: () => toast.success(status === "open" ? "Handed back to the bot" : "Conversation closed"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{conversation.title}</p>
          <p className="text-xs text-muted-foreground">Started {timeAgo(conversation.createdAt)}</p>
        </div>
        <StatusBadge status={conversation.status} />
        {conversation.status === "handed_off" && (
          <Button size="sm" variant="outline" onClick={() => changeStatus("open")} disabled={setStatus.isPending}>
            <BotIcon /> Hand back to bot
          </Button>
        )}
        {conversation.status !== "closed" && (
          <Button size="sm" variant="outline" onClick={() => changeStatus("closed")} disabled={setStatus.isPending}>
            <CheckCheckIcon /> Close
          </Button>
        )}
      </header>

      <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id}>
            <InboxMessage message={message} />
          </li>
        ))}
        <div ref={bottomRef} />
      </ol>

      <ReplyBox conversationId={id} botActive={conversation.status === "open"} />
    </div>
  );
}

/** Customer on the left, our side (bot or a person) on the right. Bot replies keep the full trace for context. */
function InboxMessage({ message }: { message: DeskmateUIMessage }) {
  if (message.role === "user") {
    return (
      <div className="w-fit max-w-[85%] rounded-lg bg-muted px-3 py-2 whitespace-pre-line">
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Customer</p>
        {messageText(message)}
      </div>
    );
  }
  const sender = message.metadata?.sender;
  if (sender) {
    return (
      <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 whitespace-pre-line text-primary-foreground">
        <p className="mb-0.5 text-xs font-medium opacity-80">{sender.name}</p>
        {messageText(message)}
      </div>
    );
  }
  return (
    <div className="ml-auto max-w-[92%] rounded-lg border p-3">
      <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <BotIcon className="size-3.5" aria-hidden /> Bot
      </p>
      <AssistantMessage message={message} streaming={false} />
    </div>
  );
}

function ReplyBox({ conversationId, botActive }: { conversationId: string; botActive: boolean }) {
  const [text, setText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const reply = useReply(conversationId);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const parsed = HumanReplyBody.safeParse({ text });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid reply");
      return;
    }
    setFormError(null);
    reply.mutate(parsed.data.text, {
      onSuccess: () => setText(""),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1 border-t p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Reply to the customer…"
          aria-label="Your reply"
          aria-invalid={formError !== null}
          className="resize-none"
        />
        <Button type="submit" size="icon" disabled={reply.isPending} aria-label="Send reply">
          {reply.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        </Button>
      </div>
      <p className={cn("text-xs", formError ? "text-destructive" : "text-muted-foreground")}>
        {formError ??
          (botActive
            ? "The bot is answering this chat. Replying takes it over, and the bot stops."
            : "The customer sees your reply instantly, with your name.")}
      </p>
    </form>
  );
}

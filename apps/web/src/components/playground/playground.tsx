"use client";

import { useChat } from "@ai-sdk/react";
import { SendMessageBody, type DeskmateUIMessage } from "@deskmate/shared/chat";
import { DefaultChatTransport } from "ai";
import { Loader2Icon, PlusIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { chatErrorMessage, createConversation, messageText, useConversation } from "@/lib/chat";
import { useDocuments } from "@/lib/documents";
import { AssistantMessage } from "./assistant-message";

const PLAYGROUND_PATH = "/dashboard/playground";

/**
 * The conversation id lives in the URL (?c=...), so reloading the page reopens the same chat from the database.
 * `key` forces a fresh chat session when you start a new conversation.
 */
export function Playground() {
  const searchParams = useSearchParams();
  const [session, setSession] = useState(() => ({ key: 0, conversationId: searchParams.get("c") }));
  const saved = useConversation(session.conversationId);

  function startNew() {
    window.history.replaceState(null, "", PLAYGROUND_PATH);
    setSession((s) => ({ key: s.key + 1, conversationId: null }));
  }

  if (session.conversationId && saved.isPending) {
    return (
      <p className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden /> Loading conversation…
      </p>
    );
  }
  if (session.conversationId && saved.isError) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-muted-foreground">This conversation doesn&apos;t exist or isn&apos;t yours.</p>
        <Button variant="outline" onClick={startNew}>
          Start a new conversation
        </Button>
      </div>
    );
  }
  return (
    <ChatSession
      key={session.key}
      conversationId={session.conversationId}
      initialMessages={saved.data?.messages ?? []}
      onStartNew={startNew}
    />
  );
}

interface ChatSessionProps {
  conversationId: string | null; // null until the first message creates one
  initialMessages: DeskmateUIMessage[];
  onStartNew: () => void;
}

function ChatSession({ conversationId, initialMessages, onStartNew }: ChatSessionProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const { data: documents } = useDocuments();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Created once per session. useChat keeps the messages; the transport decides what goes over the wire.
  const [transport] = useState(() => {
    let currentId = conversationId; // set by the first send when this is a new conversation
    return new DefaultChatTransport<DeskmateUIMessage>({
      async prepareSendMessagesRequest({ messages }) {
        // The conversation is created on the first message, not on page load, so just opening the
        // playground leaves no empty conversations behind.
        if (!currentId) {
          currentId = (await createConversation()).id;
          window.history.replaceState(null, "", `${PLAYGROUND_PATH}?c=${currentId}`);
        }
        const last = messages.at(-1);
        // Only the new text: the API loads the history from the database itself.
        return { api: `/api/conversations/${currentId}/messages`, body: { text: last ? messageText(last) : "" } };
      },
      fetch: async (url, init) => {
        const res = await fetch(url, init);
        if (res.status === 401) router.replace("/login");
        return res;
      },
    });
  });

  const { messages, sendMessage, status, error } = useChat<DeskmateUIMessage>({
    messages: initialMessages,
    transport,
    throttle: 50, // re-render at most every 50ms while text streams in, not on every token
    onError: (err) => {
      if (err instanceof ApiRequestError && err.status === 401) router.replace("/login");
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const readyCount = documents?.filter((d) => d.status === "ready").length;

  // Scroll when a message is added or the status changes, not on every streamed token.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    // Same rule as the API (non-empty, at most 2000 characters).
    const parsed = SendMessageBody.safeParse({ text: input });
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "Invalid message");
      return;
    }
    setInputError(null);
    setInput("");
    void sendMessage({ text: parsed.data.text });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a new line (the usual chat convention).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="space-y-6">
      {readyCount === 0 && (
        <p className="rounded-md border bg-muted/50 p-3 text-sm">
          You have no ready documents yet, so every question will be handed off.{" "}
          <Link href="/dashboard/documents" className="font-medium underline underline-offset-4">
            Upload one first
          </Link>
          .
        </p>
      )}

      {messages.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          Ask something a customer would ask, then a follow-up like &quot;how much is it?&quot;. Try one your docs
          answer, and one they don&apos;t.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Saved conversation · the agent sees earlier messages, so follow-ups work
            </p>
            <Button variant="outline" size="sm" onClick={onStartNew} disabled={busy}>
              <PlusIcon /> New conversation
            </Button>
          </div>
          <ol className="space-y-6">
            {messages.map((message, i) =>
              message.role === "user" ? (
                <li key={message.id}>
                  <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 whitespace-pre-line text-primary-foreground">
                    {messageText(message)}
                  </p>
                </li>
              ) : (
                <li key={message.id} className="rounded-lg border p-4">
                  <AssistantMessage message={message} streaming={busy && i === messages.length - 1} />
                </li>
              ),
            )}
            {/* Sent, but the reply hasn't started streaming yet. */}
            {status === "submitted" && (
              <li className="flex items-center gap-2 rounded-lg border p-4 text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" aria-hidden /> Thinking…
              </li>
            )}
          </ol>
        </>
      )}
      {error && <p className="text-sm text-destructive">{chatErrorMessage(error)}</p>}
      <div ref={bottomRef} />

      <form onSubmit={submit} className="sticky bottom-0 space-y-1 bg-background pt-2 pb-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. How do I pause my subscription?"
            rows={2}
            aria-label="Message"
            aria-invalid={inputError !== null}
            className="resize-none"
          />
          <Button type="submit" size="icon" disabled={busy} aria-label="Send">
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          </Button>
        </div>
        {inputError ? (
          <p className="text-sm text-destructive">{inputError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Enter to send, Shift+Enter for a new line.</p>
        )}
      </form>
    </div>
  );
}

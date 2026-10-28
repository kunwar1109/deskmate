"use client";

import { ChatBody, type ChatResponse } from "@deskmate/shared/chat";
import { Loader2Icon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useAsk } from "@/lib/chat";
import { useDocuments } from "@/lib/documents";
import { AnswerCard } from "./answer-card";

type Turn =
  | { id: string; question: string; status: "pending" }
  | { id: string; question: string; status: "done"; response: ChatResponse }
  | { id: string; question: string; status: "error"; error: string };

/**
 * Each question is answered on its own (single-shot RAG): the API doesn't see earlier turns.
 * The list here is only so you can compare answers. Multi-turn conversations come with the agent in phase 3.
 */
export function Playground() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const ask = useAsk();
  const { data: documents } = useDocuments();
  const bottomRef = useRef<HTMLDivElement>(null);

  const readyCount = documents?.filter((d) => d.status === "ready").length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    // Same rule as the API (non-empty, at most 2000 characters).
    const parsed = ChatBody.safeParse({ question });
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "Invalid question");
      return;
    }
    setInputError(null);
    const id = crypto.randomUUID();
    const text = parsed.data.question;
    setTurns((prev) => [...prev, { id, question: text, status: "pending" }]);
    setQuestion("");

    ask.mutate(
      { question: text },
      {
        onSuccess: (response) =>
          setTurns((prev) => prev.map((t) => (t.id === id ? { id, question: text, status: "done", response } : t))),
        onError: (err) =>
          setTurns((prev) =>
            prev.map((t) => (t.id === id ? { id, question: text, status: "error", error: errorMessage(err) } : t)),
          ),
      },
    );
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

      {turns.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          Ask something a customer would ask. Try one your docs answer, and one they don&apos;t.
        </p>
      ) : (
        <ol className="space-y-6">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-3">
              <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground">
                {turn.question}
              </p>
              <div className="rounded-lg border p-4">
                {turn.status === "pending" && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" aria-hidden /> Searching your docs…
                  </p>
                )}
                {turn.status === "error" && <p className="text-sm text-destructive">{turn.error}</p>}
                {turn.status === "done" && <AnswerCard turnId={turn.id} response={turn.response} />}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div ref={bottomRef} />

      <form onSubmit={submit} className="sticky bottom-0 space-y-1 bg-background pt-2 pb-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. How do I pause my subscription?"
            rows={2}
            aria-label="Question"
            aria-invalid={inputError !== null}
            className="resize-none"
          />
          <Button type="submit" size="icon" disabled={ask.isPending} aria-label="Send">
            {ask.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
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

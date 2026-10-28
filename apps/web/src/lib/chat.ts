import type { Conversation, ConversationWithMessages, DeskmateUIMessage, Passage } from "@deskmate/shared/chat";
import { useQuery } from "@tanstack/react-query";
import { ApiRequestError, apiFetch, postJson } from "@/lib/api";

/** Loads a saved conversation once, to seed useChat. After that, useChat owns the messages. */
export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => apiFetch<ConversationWithMessages>(`/conversations/${id}`),
    enabled: id !== null,
    staleTime: Infinity, // a refetch can't change the chat on screen, so don't make one
    refetchOnWindowFocus: false,
  });
}

export function createConversation() {
  return postJson<Conversation>("/conversations");
}

export function messageText(message: DeskmateUIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** Every passage the agent was shown in this reply, across all its searches, in citation order. */
export function messagePassages(message: DeskmateUIMessage): Passage[] {
  const byNumber = new Map<number, Passage>();
  for (const part of message.parts) {
    if (part.type === "tool-searchDocs" && part.state === "output-available") {
      for (const passage of part.output.passages) byNumber.set(passage.n, passage);
    }
  }
  return [...byNumber.values()].sort((a, b) => a.n - b.n);
}

/**
 * useChat errors come in two shapes: an HTTP error before streaming starts (the transport puts the
 * response body, our `{ error }` JSON, in the message) or an error part mid-stream (already a readable line).
 */
export function chatErrorMessage(err: Error): string {
  if (err instanceof ApiRequestError) return err.message;
  try {
    const body: unknown = JSON.parse(err.message);
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON: a mid-stream error text from the API
  }
  return err.message || "Something went wrong. Please try again.";
}

export type AnswerPart = { type: "text"; text: string } | { type: "citation"; n: number };

/**
 * Splits "Costs ₹1,299 [1][2]." into text and citation parts, so each [n] can be rendered as a
 * button that points at source n. Numbers with no matching source stay plain text, because the
 * model could in theory write a [7] that doesn't exist.
 */
export function parseCitations(answer: string, sourceNumbers: Set<number>): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (!sourceNumbers.has(n)) continue;
    if (match.index > last) parts.push({ type: "text", text: answer.slice(last, match.index) });
    parts.push({ type: "citation", n });
    last = match.index + match[0].length;
  }
  if (last < answer.length) parts.push({ type: "text", text: answer.slice(last) });
  return parts;
}

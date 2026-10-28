import type { ChatInput, ChatResponse } from "@deskmate/shared/chat";
import { useMutation } from "@tanstack/react-query";
import { postJson } from "@/lib/api";

export function useAsk() {
  return useMutation({
    mutationFn: (input: ChatInput) => postJson<ChatResponse>("/chat", input),
  });
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

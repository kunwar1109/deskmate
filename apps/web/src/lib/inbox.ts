import type {
  Conversation,
  ConversationStatus,
  ConversationStatusInput,
  ConversationWithMessages,
  DeskmateUIMessage,
} from "@deskmate/shared/chat";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch, postJson } from "@/lib/api";

/** Inbox tabs. "needs_human" lists handed_off chats: the ones a person must answer. */
export type InboxFilter = "needs_human" | "all" | "closed";

const FILTER_STATUS: Record<InboxFilter, ConversationStatus | undefined> = {
  needs_human: "handed_off",
  all: undefined,
  closed: "closed",
};

export const inboxKey = (filter: InboxFilter) => ["conversations", filter] as const;
export const conversationKey = (id: string) => ["conversation", id] as const;

/**
 * Fetched once; after that the socket keeps it current (see realtime.tsx), so no polling.
 * After a reconnect the socket invalidates it, to catch up on anything missed while offline.
 */
export function useInbox(filter: InboxFilter) {
  return useQuery({
    queryKey: inboxKey(filter),
    queryFn: () => {
      const status = FILTER_STATUS[filter];
      return apiFetch<Conversation[]>(`/conversations${status ? `?status=${status}` : ""}`);
    },
  });
}

export function useReply(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => postJson<DeskmateUIMessage>(`/conversations/${conversationId}/replies`, { text }),
    // The socket delivers the same message; addMessage ignores whichever copy arrives second.
    onSuccess: (message) => addMessage(queryClient, conversationId, message),
  });
}

export function useSetStatus(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConversationStatusInput) =>
      postJson<Conversation>(`/conversations/${conversationId}/status`, input),
    onSuccess: (conversation) => upsertConversation(queryClient, conversation),
  });
}

/** Puts a changed conversation into every cached inbox list (or takes it out, if it no longer matches the tab). */
export function upsertConversation(queryClient: QueryClient, conversation: Conversation) {
  for (const [key, list] of queryClient.getQueriesData<Conversation[]>({ queryKey: ["conversations"] })) {
    if (!list) continue;
    const status = FILTER_STATUS[key[1] as InboxFilter];
    const rest = list.filter((c) => c.id !== conversation.id);
    // Newest activity first, like the API's sort.
    queryClient.setQueryData(key, status && conversation.status !== status ? rest : [conversation, ...rest]);
  }
  queryClient.setQueryData<ConversationWithMessages>(conversationKey(conversation.id), (old) =>
    old ? { ...old, conversation } : old,
  );
}

/** Appends a message to an open conversation's cache, once (it can arrive from both the socket and a mutation). */
export function addMessage(queryClient: QueryClient, conversationId: string, message: DeskmateUIMessage) {
  queryClient.setQueryData<ConversationWithMessages>(conversationKey(conversationId), (old) =>
    old && !old.messages.some((m) => m.id === message.id) ? { ...old, messages: [...old.messages, message] } : old,
  );
}

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Bot answering",
  handed_off: "Needs a human",
  closed: "Closed",
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "yesterday". */
export function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (seconds > -45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

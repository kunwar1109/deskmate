"use client";

import type { AgentServerEvents, RealtimeTicket } from "@deskmate/shared/realtime";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { addMessage, upsertConversation } from "@/lib/inbox";

/**
 * Keeps the dashboard live: one Socket.io connection per tab, straight to the API.
 * Events update TanStack Query's cache, so every component showing the inbox re-renders by itself.
 *
 * Auth: the API is a different site in production, so the session cookie isn't sent there. Each (re)connect
 * fetches a fresh 60-second ticket through the normal cookie-protected API instead.
 */
export function RealtimeConnection() {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Last status seen per conversation, so "needs a human" toasts once per handoff, not once per message.
  const statuses = useRef(new Map<string, string>());

  useEffect(() => {
    let socket: Socket<AgentServerEvents> | undefined;
    let cancelled = false;
    const fetchTicket = () => apiFetch<RealtimeTicket>("/realtime/ticket");

    fetchTicket()
      .then(({ url, token }) => {
        if (cancelled) return;
        let firstToken: string | undefined = token;
        socket = io(`${url}/agents`, {
          // Called on every connection attempt: the first uses the ticket we already have, reconnects get a new one.
          auth: (send) => {
            if (firstToken) {
              send({ token: firstToken });
              firstToken = undefined;
              return;
            }
            fetchTicket()
              .then((ticket) => send({ token: ticket.token }))
              .catch(() => send({})); // logged out: the server refuses, and the next page load goes to /login
          },
        });

        // Events can be missed while disconnected (laptop asleep, network drop), so refetch on every (re)connect.
        socket.on("connect", () => void queryClient.invalidateQueries({ queryKey: ["conversations"] }));

        socket.on("conversation:upsert", (conversation) => {
          const previous = statuses.current.get(conversation.id);
          statuses.current.set(conversation.id, conversation.status);
          upsertConversation(queryClient, conversation);
          if (conversation.status === "handed_off" && previous !== "handed_off") {
            toast("A customer needs a human", {
              description: conversation.title,
              action: { label: "Open", onClick: () => router.push(`/dashboard/inbox?c=${conversation.id}`) },
            });
          }
        });

        socket.on("message:new", ({ conversationId, message }) => addMessage(queryClient, conversationId, message));
      })
      .catch(() => {
        // No ticket (logged out, API down): the dashboard still works, just without live updates.
      });

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [queryClient, router]);

  return null;
}

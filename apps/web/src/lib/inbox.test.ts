import type { Conversation, ConversationWithMessages, DeskmateUIMessage } from "@deskmate/shared/chat";
import { describe, expect, it } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";
import { addMessage, conversationKey, inboxKey, upsertConversation } from "@/lib/inbox";

const chat = (id: string, status: Conversation["status"]): Conversation => ({
  id,
  channel: "widget",
  status,
  title: `Chat ${id}`,
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
});

const ids = (client: QueryClient, filter: Parameters<typeof inboxKey>[0]) =>
  client.getQueryData<Conversation[]>(inboxKey(filter))?.map((c) => c.id);

/** A cache as the inbox leaves it after loading all three tabs. */
function loadedInbox() {
  const client = new QueryClient();
  client.setQueryData(inboxKey("needs_human"), [chat("a", "handed_off")]);
  client.setQueryData(inboxKey("all"), [chat("a", "handed_off"), chat("b", "open")]);
  client.setQueryData(inboxKey("closed"), []);
  return client;
}

describe("upsertConversation (socket and mutation updates)", () => {
  it("adds a newly handed-off chat to the top of 'needs a human' and 'all'", () => {
    const client = loadedInbox();
    upsertConversation(client, chat("b", "handed_off"));

    expect(ids(client, "needs_human")).toEqual(["b", "a"]);
    expect(ids(client, "all")).toEqual(["b", "a"]); // moved to the top, not duplicated
    expect(ids(client, "closed")).toEqual([]);
  });

  it("moves a closed chat out of 'needs a human' and into 'closed'", () => {
    const client = loadedInbox();
    upsertConversation(client, chat("a", "closed"));

    expect(ids(client, "needs_human")).toEqual([]);
    expect(ids(client, "closed")).toEqual(["a"]);
    expect(ids(client, "all")).toEqual(["a", "b"]);
  });

  it("leaves tabs that were never loaded alone", () => {
    const client = new QueryClient();
    client.setQueryData(inboxKey("all"), []);
    upsertConversation(client, chat("a", "handed_off"));

    expect(ids(client, "all")).toEqual(["a"]);
    expect(client.getQueryData(inboxKey("needs_human"))).toBeUndefined(); // fetched fresh when opened
  });

  it("updates the status of an open conversation view", () => {
    const client = loadedInbox();
    client.setQueryData<ConversationWithMessages>(conversationKey("a"), { conversation: chat("a", "handed_off"), messages: [] });
    upsertConversation(client, chat("a", "open"));

    expect(client.getQueryData<ConversationWithMessages>(conversationKey("a"))?.conversation.status).toBe("open");
  });
});

describe("addMessage", () => {
  const reply: DeskmateUIMessage = { id: "m1", role: "assistant", parts: [{ type: "text", text: "Hi, Priya here." }] };

  it("appends a message once, even when the socket and the mutation both deliver it", () => {
    const client = new QueryClient();
    client.setQueryData<ConversationWithMessages>(conversationKey("a"), { conversation: chat("a", "handed_off"), messages: [] });

    addMessage(client, "a", reply);
    addMessage(client, "a", reply);

    expect(client.getQueryData<ConversationWithMessages>(conversationKey("a"))?.messages).toEqual([reply]);
  });

  it("ignores messages for a conversation nobody has open", () => {
    const client = new QueryClient();
    addMessage(client, "a", reply);

    expect(client.getQueryData(conversationKey("a"))).toBeUndefined();
  });
});

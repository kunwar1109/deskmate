import type { Conversation } from "@deskmate/shared/chat";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, waitFor } from "@testing-library/react";
import { inboxKey } from "@/lib/inbox";
import { jsonResponse, mockFetch, renderWithQuery } from "@/test/utils";

/**
 * A stand-in for a Socket.io connection: records the handlers the component registers, so the test
 * can play the server and "push" events. No network, no API process.
 */
type Handler = (...args: unknown[]) => void;
const socket = {
  handlers: new Map<string, Handler>(),
  on(event: string, handler: Handler) {
    socket.handlers.set(event, handler);
    return socket;
  },
  close: jest.fn(),
  /** What the server sending `event` looks like to the component. */
  push(event: string, ...args: unknown[]) {
    act(() => socket.handlers.get(event)?.(...args));
  },
};
type AuthCallback = (send: (data: object) => void) => void;
const io = jest.fn<(url: string, options: { auth: AuthCallback }) => typeof socket>(() => socket);
jest.mock("socket.io-client", () => ({ io }));

const toast = jest.fn();
jest.mock("sonner", () => ({ toast }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

let RealtimeConnection: typeof import("@/components/realtime").RealtimeConnection;

const chat = (status: Conversation["status"]): Conversation => ({
  id: "c1",
  channel: "widget",
  status,
  title: "Where is my order?",
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
});

describe("RealtimeConnection", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeAll(async () => {
    ({ RealtimeConnection } = await import("@/components/realtime"));
  });

  beforeEach(() => {
    socket.handlers.clear();
    socket.close.mockClear();
    io.mockClear();
    toast.mockClear();
    fetchMock = mockFetch();
    let n = 0;
    // Each call to the ticket endpoint returns a new token: ticket-1, ticket-2, ...
    fetchMock.mockImplementation(async () => jsonResponse(200, { token: `ticket-${++n}`, url: "http://api.test" }));
  });

  /** Renders the component and waits until it has connected (registered its handlers). */
  async function connect() {
    const result = renderWithQuery(<RealtimeConnection />);
    await waitFor(() => expect(io).toHaveBeenCalled());
    return result;
  }

  it("fetches a ticket over HTTP, then connects to the /agents namespace", async () => {
    await connect();

    expect(fetchMock).toHaveBeenCalledWith("/api/realtime/ticket", undefined);
    expect(io.mock.calls[0]![0]).toBe("http://api.test/agents");
  });

  it("uses the first ticket once and fetches a fresh one for every reconnect", async () => {
    await connect();
    const auth = io.mock.calls[0]![1].auth;
    const sent: object[] = [];

    auth((data) => sent.push(data)); // first connection
    auth((data) => sent.push(data)); // a reconnect, e.g. after the laptop slept
    await waitFor(() => expect(sent).toHaveLength(2));

    // Tickets live 60 s, so a reconnect minutes later must not reuse the first one.
    expect(sent).toEqual([{ token: "ticket-1" }, { token: "ticket-2" }]);
  });

  it("puts pushed conversations into the cached inbox", async () => {
    const { client } = await connect();
    client.setQueryData(inboxKey("needs_human"), []);

    socket.push("conversation:upsert", chat("handed_off"));

    expect(client.getQueryData<Conversation[]>(inboxKey("needs_human"))?.map((c) => c.id)).toEqual(["c1"]);
  });

  it("toasts once per handoff, not once per message in a handed-off chat", async () => {
    await connect();

    socket.push("conversation:upsert", chat("open"));
    socket.push("conversation:upsert", chat("handed_off"));
    socket.push("conversation:upsert", chat("handed_off")); // the customer sent another message
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("A customer needs a human", expect.objectContaining({ description: "Where is my order?" }));

    socket.push("conversation:upsert", chat("open")); // handed back to the bot
    socket.push("conversation:upsert", chat("handed_off")); // and handed off again
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it("refetches the inbox on every (re)connect, to catch events missed while offline", async () => {
    const { client } = await connect();
    client.setQueryData(inboxKey("all"), []);

    socket.push("connect");

    expect(client.getQueryState(inboxKey("all"))?.isInvalidated).toBe(true);
  });

  it("closes the socket when the dashboard unmounts", async () => {
    const { unmount } = await connect();
    unmount();

    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the dashboard working without live updates when no ticket can be fetched", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Not logged in" }));
    renderWithQuery(<RealtimeConnection />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(io).not.toHaveBeenCalled();
  });
});

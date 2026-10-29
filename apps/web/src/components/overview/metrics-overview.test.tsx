import type { WorkspaceMetrics } from "@deskmate/shared/metrics";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetricsOverview } from "@/components/overview/metrics-overview";
import { jsonResponse, mockFetch, renderWithQuery } from "@/test/utils";

const metrics = (overrides: Partial<WorkspaceMetrics> = {}): WorkspaceMetrics => ({
  days: 7,
  since: "2026-10-22T00:00:00.000Z",
  conversations: { total: 3, widget: 2, playground: 1 },
  botReplies: 8,
  humanReplies: 2,
  handoffs: { total: 2, byReason: { not_in_docs: 1, customer_requested: 1 } },
  latencyMs: { median: 2400, p95: 6100 },
  tokens: { input: 24_000, output: 900 },
  cost: { model: "gemini-flash-lite-latest", estimatedUsd: 0.00945, inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  recent: [
    {
      id: "c1",
      title: "Where is my order?",
      channel: "widget",
      status: "handed_off",
      botReplies: 2,
      tokens: { input: 6000, output: 200 },
      estimatedCostUsd: 0.0023,
      avgLatencyMs: 3100,
      lastReplyAt: "2026-10-28T10:00:00.000Z",
    },
  ],
  ...overrides,
});

describe("MetricsOverview", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetchMock = mockFetch();
  });

  it("shows volume, handoff rate, response times and estimated cost", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, metrics()));
    renderWithQuery(<MetricsOverview />);

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("2 from customers, 1 test chats")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument(); // 2 handoffs in 8 bot replies
    expect(screen.getByText(/1 not in the docs, 1 customer asked/)).toBeInTheDocument();
    expect(screen.getByText("2.4 s")).toBeInTheDocument();
    expect(screen.getByText("95% of replies within 6.1 s")).toBeInTheDocument();
    expect(screen.getByText("$0.0095")).toBeInTheDocument();
    expect(screen.getByText(/The free tier costs \$0/)).toBeInTheDocument();
  });

  it("links each recent conversation to where it can be read", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, metrics()));
    renderWithQuery(<MetricsOverview />);

    const link = await screen.findByRole("link", { name: "Where is my order?" });
    expect(link).toHaveAttribute("href", "/dashboard/inbox?c=c1"); // a customer chat opens in the inbox
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("3.1 s")).toBeInTheDocument();
    expect(within(row).getByText("$0.0023")).toBeInTheDocument();
  });

  it("asks the API for another period when one is picked", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, metrics()));
    const user = userEvent.setup();
    renderWithQuery(<MetricsOverview />);
    await screen.findByText("2.4 s");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/metrics?days=7", undefined);

    await user.click(screen.getByRole("button", { name: "30 days" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/metrics?days=30", undefined));
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Last 30 days" })).toBeInTheDocument();
  });

  it("says what to do when there are no replies yet", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, metrics({ botReplies: 0, handoffs: { total: 0, byReason: {} }, latencyMs: { median: null, p95: null }, recent: [] })),
    );
    renderWithQuery(<MetricsOverview />);

    expect(await screen.findByText(/No bot replies in this period/)).toBeInTheDocument();
    expect(screen.getByText("No bot replies yet")).toBeInTheDocument();
  });
});

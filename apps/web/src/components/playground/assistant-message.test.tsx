import { HANDOFF_MESSAGE, type DeskmateUIMessage, type Passage } from "@deskmate/shared/chat";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantMessage } from "@/components/playground/assistant-message";

const passage = (n: number, title: string, score: number): Passage => ({
  n,
  documentId: `doc-${n}`,
  title,
  score,
  text: `Passage ${n} text`,
});

/** A finished reply: one search that returned two passages, and an answer citing [1] (and a made-up [3]). */
const answered: DeskmateUIMessage = {
  id: "reply-1",
  role: "assistant",
  parts: [
    {
      type: "tool-searchDocs",
      toolCallId: "call-1",
      state: "output-available",
      input: { query: "explorer price" },
      output: { found: true, bestScore: 0.91, passages: [passage(1, "Pricing", 0.91), passage(2, "Shipping", 0.74)] },
    },
    { type: "text", text: "Explorer costs ₹1,299 a month [1][3]." },
  ],
  metadata: { latencyMs: 2400, usage: { inputTokens: 900, outputTokens: 40 }, topScore: 0.91 },
};

// jsdom has no layout engine, so it doesn't implement scrolling. Record the calls instead.
const scrollIntoView = jest.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe("AssistantMessage", () => {
  it("turns citations with a matching passage into buttons and leaves invented ones as text", () => {
    render(<AssistantMessage message={answered} streaming={false} />);

    expect(screen.getByRole("button", { name: "Show source 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show source 3" })).not.toBeInTheDocument();
    expect(screen.getByText(/\[3\]/)).toBeInTheDocument(); // still visible, just not clickable
  });

  it("marks which passages the answer cited", () => {
    render(<AssistantMessage message={answered} streaming={false} />);

    const pricing = screen.getByText("Pricing").closest("div[id]") as HTMLElement;
    const shipping = screen.getByText("Shipping").closest("div[id]") as HTMLElement;
    expect(within(pricing).getByText("Cited")).toBeInTheDocument();
    expect(within(shipping).getByText("Not cited")).toBeInTheDocument();
    expect(within(pricing).getByText("0.910")).toBeInTheDocument(); // the owner sees similarity scores
  });

  it("scrolls to the passage when a citation is clicked", async () => {
    const user = userEvent.setup();
    render(<AssistantMessage message={answered} streaming={false} />);

    await user.click(screen.getByRole("button", { name: "Show source 1" }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute("id", "reply-1-source-1");
  });

  it("says what the agent is doing while a tool runs, and doesn't judge citations yet", () => {
    const streaming: DeskmateUIMessage = {
      id: "reply-2",
      role: "assistant",
      parts: [{ type: "tool-searchDocs", toolCallId: "call-1", state: "input-available", input: { query: "pause plan" } }],
    };
    render(<AssistantMessage message={streaming} streaming />);

    expect(screen.getByText("Searched docs for “pause plan”…")).toBeInTheDocument();
    expect(screen.getByLabelText("running")).toBeInTheDocument();
    expect(screen.queryByText("Not cited")).not.toBeInTheDocument();
  });

  it("explains a handoff to the owner: the reason, the agent's note and the best score", () => {
    const handedOff: DeskmateUIMessage = {
      id: "reply-3",
      role: "assistant",
      parts: [
        {
          type: "tool-handoffToHuman",
          toolCallId: "call-2",
          state: "output-available",
          input: { reason: "not_in_docs", summary: "Customer asks about espresso machines." },
          output: { message: HANDOFF_MESSAGE },
        },
      ],
      metadata: { handoffReason: "not_in_docs", topScore: 0.62 },
    };
    render(<AssistantMessage message={handedOff} streaming={false} />);

    expect(screen.getByText(HANDOFF_MESSAGE)).toBeInTheDocument(); // what the customer was told
    expect(screen.getByText("Handed off to a human", { selector: "p" })).toBeInTheDocument(); // the box title, not the tool step
    expect(screen.getByText(/they don't answer this, so it refused to guess/)).toBeInTheDocument();
    expect(screen.getByText("Note for your team: Customer asks about espresso machines.")).toBeInTheDocument();
    expect(screen.getByText("Best match score: 0.620")).toBeInTheDocument();
  });

  it("flags a reply that ended with no text and no handoff", () => {
    const empty: DeskmateUIMessage = { id: "reply-4", role: "assistant", parts: [] };
    render(<AssistantMessage message={empty} streaming={false} />);

    expect(screen.getByText(/This reply didn.t finish/)).toBeInTheDocument();
  });
});

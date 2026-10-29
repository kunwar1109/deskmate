import { describe, expect, it } from "@jest/globals";
import { chatErrorMessage, parseCitations } from "@/lib/chat";

describe("parseCitations", () => {
  it("splits an answer into text and citation parts", () => {
    expect(parseCitations("Explorer costs ₹1,299 [1][2].", new Set([1, 2]))).toEqual([
      { type: "text", text: "Explorer costs ₹1,299 " },
      { type: "citation", n: 1 },
      { type: "citation", n: 2 },
      { type: "text", text: "." },
    ]);
  });

  it("leaves a number with no matching source as plain text", () => {
    // The model could write [7] when only 2 passages exist; that must not become a dead button.
    expect(parseCitations("See [7].", new Set([1, 2]))).toEqual([{ type: "text", text: "See [7]." }]);
  });

  it("handles an answer with no citations", () => {
    expect(parseCitations("Hello!", new Set([1]))).toEqual([{ type: "text", text: "Hello!" }]);
  });
});

describe("chatErrorMessage", () => {
  it("reads the API's { error } JSON from an HTTP error", () => {
    expect(chatErrorMessage(new Error('{"error":"Too many messages. Try again in a minute."}'))).toBe(
      "Too many messages. Try again in a minute.",
    );
  });

  it("passes a mid-stream error line through", () => {
    expect(chatErrorMessage(new Error("The AI service is busy right now."))).toBe("The AI service is busy right now.");
  });

  it("falls back to a generic line for an empty error", () => {
    expect(chatErrorMessage(new Error(""))).toBe("Something went wrong. Please try again.");
  });
});

import { describe, expect, it } from "@jest/globals";
import { formatLatency, formatTokens, formatUsd, handoffRate } from "@/lib/metrics";

describe("formatUsd", () => {
  it("keeps fractions of a cent visible instead of rounding them to $0.00", () => {
    expect(formatUsd(0.00115)).toBe("$0.0012");
    expect(formatUsd(0.55)).toBe("$0.55");
    expect(formatUsd(12.4)).toBe("$12.40");
  });

  it("shows $0 for nothing and a dash when there's no price on file", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(null)).toBe("–");
  });
});

describe("formatLatency, formatTokens, handoffRate", () => {
  it("formats for reading at a glance", () => {
    expect(formatLatency(850)).toBe("850 ms");
    expect(formatLatency(2400)).toBe("2.4 s");
    expect(formatLatency(null)).toBe("–");
    expect(formatTokens(980)).toBe("980");
    expect(formatTokens(1_234_567)).toBe("1.2M");
  });

  it("handoff rate is handoffs per bot reply, with no division by zero", () => {
    expect(handoffRate({ botReplies: 8, handoffs: { total: 1, byReason: {} } })).toBe("13%");
    expect(handoffRate({ botReplies: 0, handoffs: { total: 0, byReason: {} } })).toBe("–");
  });
});

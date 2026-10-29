import { describe, expect, it } from '@jest/globals';
import { estimateCostUsd } from '../../src/lib/cost.js';

describe('estimateCostUsd', () => {
  it('prices input and output tokens separately (output costs more)', () => {
    expect(estimateCostUsd({ input: 1_000_000, output: 0 }, 'gemini-3.5-flash-lite')).toBeCloseTo(0.3, 10);
    expect(estimateCostUsd({ input: 0, output: 1_000_000 }, 'gemini-3.5-flash-lite')).toBeCloseTo(2.5, 10);
    // A typical reply: ~3,000 tokens in (instructions, history, passages), ~100 out. Fractions of a cent.
    expect(estimateCostUsd({ input: 3_000, output: 100 }, 'gemini-3.5-flash-lite')).toBeCloseTo(0.00115, 10);
  });

  it('returns null for a model with no price on file, instead of a misleading $0', () => {
    expect(estimateCostUsd({ input: 1000, output: 1000 }, 'some-new-model')).toBeNull();
  });
});

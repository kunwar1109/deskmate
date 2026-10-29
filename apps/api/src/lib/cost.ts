import { env } from '../config.js';

interface Price {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

/**
 * Paid-tier list prices of the chat models, from https://ai.google.dev/gemini-api/docs/pricing (page updated
 * 2026-10-28). The free tier costs nothing; these estimate what the same traffic would cost on a paid plan,
 * which is the number a business would budget with. Update when Google changes prices or CHAT_MODEL changes.
 */
const CHAT_PRICES: Record<string, Price> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  // The -latest alias pointed at gemini-3.5-flash-lite on 2026-10-29 (the API names the model in its quota errors).
  'gemini-flash-lite-latest': { input: 0.3, output: 2.5 },
};

export function chatPrice(model = env.CHAT_MODEL): Price | null {
  return CHAT_PRICES[model] ?? null;
}

/** Estimated USD for a reply's tokens; null when there's no price on file for the model. */
export function estimateCostUsd(tokens: { input: number; output: number }, model = env.CHAT_MODEL): number | null {
  const price = chatPrice(model);
  if (!price) return null;
  return (tokens.input * price.input + tokens.output * price.output) / 1_000_000;
}

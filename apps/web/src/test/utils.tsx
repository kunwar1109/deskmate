import { jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Replaces the browser's fetch with a mock. jsdom has no fetch, and component tests shouldn't need
 * the API running anyway: each test says what the "server" answers and checks what was sent.
 */
export function mockFetch() {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  return fetchMock;
}

/** Just the parts of a Response that lib/api.ts reads. */
export function jsonResponse(status: number, body?: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

/** Renders inside a fresh TanStack Query cache, so no test sees another test's data. No retries: a failure shows at once. */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

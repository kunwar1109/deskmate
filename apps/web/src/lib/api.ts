import type { ApiError } from "@deskmate/shared/errors";

/** A non-2xx response from the API, with its status and the `{ error, issues }` body. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

/**
 * Browser-side API calls. Paths are relative ("/auth/login" -> "/api/auth/login"), so they go through
 * the rewrite in next.config.ts and the browser attaches the session cookie by itself.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => ({ error: "Unexpected response from the server" }));
  if (!res.ok) throw new ApiRequestError(res.status, data as ApiError);
  return data as T;
}

export function postJson<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Turns any thrown error into one line a user can read. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.body.issues?.join(". ") || err.message;
  return "Couldn't reach the server. Is the API running?";
}

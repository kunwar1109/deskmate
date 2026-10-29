import * as Sentry from '@sentry/node';

interface ErrorContext {
  workspaceId?: string;
  userId?: string;
  tags?: Record<string, string>;
  level?: 'error' | 'warning';
}

/**
 * Sends an unexpected error to Sentry with who it happened to. The workspace id is a tag, so the Sentry UI
 * can show whether a bug hits every company or just one. Only ids, never names, emails or messages.
 * A no-op when Sentry isn't configured (see instrument.ts).
 */
export function reportError(err: unknown, { workspaceId, userId, tags, level = 'error' }: ErrorContext = {}) {
  Sentry.captureException(err, {
    level,
    tags: { ...(workspaceId ? { workspaceId } : {}), ...tags },
    ...(userId ? { user: { id: userId } } : {}),
  });
}

/** Sends what's still buffered before the process exits; gives up after 2 s so a shutdown never hangs. */
export function flushErrors() {
  return Sentry.close(2000);
}

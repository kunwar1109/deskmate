import type { WidgetConfig, WidgetConversation, WidgetSession, WidgetUIMessage } from '@deskmate/shared/widget';

export interface WidgetOptions {
  apiUrl: string; // e.g. https://api.deskmate.app
  widgetKey: string;
}

/** Calls to the public widget API. Never sends cookies: a chat is identified by its visitor token. */
export function createApi({ apiUrl, widgetKey }: WidgetOptions) {
  const base = `${apiUrl}/api/public/w/${encodeURIComponent(widgetKey)}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, credentials: 'omit' });
    } catch {
      // fetch only throws when there's no response at all: offline, API down, or blocked by CORS
      throw new ApiError(0, "Couldn't reach the chat service. Check your connection and try again.");
    }
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, errorText(body) ?? `Request failed (${res.status})`);
    return body as T;
  }

  return {
    getConfig: () => request<WidgetConfig>(''),
    createConversation: () => request<WidgetSession>('/conversations', { method: 'POST' }),
    /** A saved chat, or null if it's gone (deleted, or the key was rotated). */
    async loadConversation(session: WidgetSession): Promise<WidgetConversation | null> {
      try {
        return await request<WidgetConversation>(`/conversations/${session.conversationId}`, {
          headers: { Authorization: `Bearer ${session.visitorToken}` },
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    messagesUrl: (conversationId: string) => `${base}/conversations/${conversationId}/messages`,
  };
}

export type WidgetApi = ReturnType<typeof createApi>;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorText(body: unknown): string | undefined {
  return body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : undefined;
}

/**
 * useChat errors come in two shapes: an HTTP error before streaming starts (the transport puts the
 * response body, our `{ error }` JSON, in the message) or an error part mid-stream (already a readable line).
 */
export function chatErrorMessage(err: Error): string {
  try {
    return errorText(JSON.parse(err.message)) ?? err.message;
  } catch {
    return err.message || 'Something went wrong. Please try again.';
  }
}

/**
 * The visitor's chat is remembered in the host site's localStorage, so it survives page loads.
 * Storage can be unavailable (private mode, blocked site data); then each page load starts fresh.
 */
const storageKey = (widgetKey: string) => `deskmate:${widgetKey}`;

export function loadSession(widgetKey: string): WidgetSession | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(widgetKey)) ?? 'null');
    if (value && typeof value === 'object' && 'conversationId' in value && 'visitorToken' in value) {
      return value as WidgetSession;
    }
  } catch {
    // unreadable or unavailable storage: start fresh
  }
  return null;
}

export function saveSession(widgetKey: string, session: WidgetSession) {
  try {
    localStorage.setItem(storageKey(widgetKey), JSON.stringify(session));
  } catch {
    // storage unavailable: the chat still works, it just won't survive a reload
  }
}

export function clearSession(widgetKey: string) {
  try {
    localStorage.removeItem(storageKey(widgetKey));
  } catch {
    // nothing to clear
  }
}

export function messageText(message: WidgetUIMessage): string {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

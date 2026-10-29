import { readFileSync } from 'node:fs';
import type { AuthResponse } from '@deskmate/shared/auth';
import type { WidgetSettings } from '@deskmate/shared/widget';
import { test as base, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { API_URL, SITE_URL } from './urls';

/**
 * Written by shared.setup.ts: a logged-in owner (cookies, for `test.use({ storageState })`) whose workspace
 * has the sample help center indexed, and that workspace's widget key.
 */
export const SHARED_STATE = new URL('.auth/owner.json', import.meta.url).pathname;
export const SHARED_INFO = new URL('.auth/workspace.json', import.meta.url).pathname;
export const SHARED_OWNER = { name: 'Priya', workspaceName: 'BrewBox' };

export interface Owner {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

/** A random private IPv4 address, sent as X-Forwarded-For so each test gets its own rate-limit buckets. */
export function randomIp() {
  const byte = () => Math.floor(Math.random() * 254) + 1;
  return `10.${byte()}.${byte()}.${byte()}`;
}

/** Creates an account through the API. With a page's `request`, the session cookie lands in that browser context. */
export async function signUp(request: APIRequestContext, overrides: Partial<Owner> = {}): Promise<Owner> {
  const owner = {
    name: 'Ana',
    email: `owner-${crypto.randomUUID()}@example.com`,
    password: 'a-long-password',
    workspaceName: `Shop ${Math.random().toString(36).slice(2, 7)}`,
    ...overrides,
  };
  const res = await request.post('/api/auth/signup', { data: owner });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as AuthResponse;
  expect(body.workspace.name).toBe(owner.workspaceName);
  return owner;
}

export async function widgetSettings(request: APIRequestContext): Promise<WidgetSettings> {
  const res = await request.get('/api/widget');
  expect(res.ok()).toBe(true);
  return (await res.json()) as WidgetSettings;
}

/** The fake customer website, embedding the widget with this key. */
export const shopUrl = (widgetKey: string) => `${SITE_URL}/?key=${encodeURIComponent(widgetKey)}`;

/**
 * Makes every request from this browser context to the E2E API look like it comes from its own client IP,
 * so per-IP rate limits (10 chats an hour) don't carry over between tests and runs.
 * Added in a route, not with `extraHTTPHeaders`: Chromium treats those as headers the page set itself,
 * so every cross-origin widget call would need a CORS preflight the API rightly refuses. A route adds the
 * header at the network layer, after the browser's CORS checks, like a real proxy in front of the API.
 */
export async function asVisitor(context: BrowserContext, ip = randomIp()) {
  await context.route(`${API_URL}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }),
  );
}

export const test = base.extend<{ owner: Owner }>({
  context: async ({ context }, use) => {
    await asVisitor(context);
    await use(context);
  },
  /** A fresh account and workspace, logged in in this test's browser context. */
  owner: async ({ page }, use) => {
    await use(await signUp(page.request));
  },
});

/** The shared, indexed workspace: its login state and widget key. Only exists after the setup project ran. */
export function sharedWorkspace(): { widgetKey: string } {
  return JSON.parse(readFileSync(SHARED_INFO, 'utf8')) as { widgetKey: string };
}

export { expect };

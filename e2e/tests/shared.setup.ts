import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DocumentSummary } from '@deskmate/shared/documents';
import { expect, test as setup } from '@playwright/test';
import { SHARED_INFO, SHARED_OWNER, SHARED_STATE, signUp, widgetSettings } from '../fixtures';

const SAMPLE = new URL('../../samples/brewbox-help-center.md', import.meta.url).pathname;

/**
 * Runs before the chat tests (project dependency in playwright.config.ts): one workspace with the sample
 * help center uploaded and indexed, shared by every test that asks a question. Uploading once per run
 * instead of once per test saves ~15 s and Gemini embedding quota each time.
 * Tagged @ai because it embeds the document with Gemini; skipped along with the chat tests.
 */
setup('shared workspace with the sample help center', { tag: '@ai' }, async ({ request }) => {
  setup.setTimeout(150_000);
  await signUp(request, SHARED_OWNER);

  const upload = await request.post('/api/documents', {
    multipart: {
      title: 'BrewBox Help Center',
      file: { name: 'brewbox-help-center.md', mimeType: 'text/markdown', buffer: readFileSync(SAMPLE) },
    },
  });
  expect(upload.status()).toBe(202); // accepted: the worker does the rest in the background
  const { id } = (await upload.json()) as DocumentSummary;

  // The worker extracts, chunks, embeds and waits until Atlas can search the chunks.
  await expect
    .poll(
      async () => ((await (await request.get(`/api/documents/${id}`)).json()) as DocumentSummary).status,
      { timeout: 120_000, intervals: [2_000] },
    )
    .toBe('ready');

  const { key } = await widgetSettings(request);
  mkdirSync(dirname(SHARED_STATE), { recursive: true });
  await request.storageState({ path: SHARED_STATE }); // the session cookie, for the dashboard tests
  writeFileSync(SHARED_INFO, JSON.stringify({ widgetKey: key }));
});

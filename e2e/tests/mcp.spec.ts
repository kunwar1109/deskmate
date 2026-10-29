import { expect, SHARED_STATE, test } from '../fixtures';
import { API_URL } from '../urls';

/**
 * The MCP server end to end: a key made in the dashboard, then a raw MCP request, the JSON-RPC message an AI
 * tool like Claude or Cursor sends, answered by a real embedding and a real Atlas vector search over the
 * shared workspace's sample help center.
 */
test.use({ storageState: SHARED_STATE });

test('a dashboard API key lets an MCP client search the help docs, until the key is deleted', { tag: '@ai' }, async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dashboard/api-keys');
  await page.getByLabel('Key name').fill('E2E client');
  await page.getByRole('button', { name: 'Create key' }).click();
  const key = (await page.getByLabel('New API key').textContent())!.trim();
  expect(key).toMatch(/^dmk_/);

  const callSearch = () =>
    page.request.post(`${API_URL}/mcp`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json, text/event-stream' },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_knowledge_base', arguments: { query: 'How much is the Explorer plan?' } },
      },
    });

  const res = await callSearch();
  expect(res.status()).toBe(200);
  const { result } = (await res.json()) as {
    result: { structuredContent: { passages: { title: string; score: number; text: string }[] } };
  };
  const passages = result.structuredContent.passages;
  expect(passages.length).toBeGreaterThan(0);
  expect(passages[0]!.title).toBe('BrewBox Help Center');
  expect(passages.map((p) => p.text).join(' ')).toMatch(/₹\s?1,299/);
  expect(passages.every((p) => p.score >= 0.7)).toBe(true); // weak matches are filtered out

  // The dashboard shows the key was used, then deleting it cuts the client off at once.
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'E2E client' });
  await expect(row).not.toContainText('Never');
  await row.getByRole('button', { name: 'Delete E2E client' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(row).toBeHidden();
  expect((await callSearch()).status()).toBe(401);
});

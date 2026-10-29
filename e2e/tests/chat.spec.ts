import { expect, SHARED_STATE, sharedWorkspace, shopUrl, test } from '../fixtures';

/**
 * Real questions to the real agent (Gemini), in the shared workspace with the sample help center.
 * Answers vary in wording between runs, so the checks look for facts that are in the docs (₹1,299)
 * and for structure (citations, sources, the fixed handoff text), never for exact sentences.
 * The eval suite (npm run eval) measures answer quality; these tests check that the pieces connect.
 */
test.describe('asking questions', { tag: '@ai' }, () => {
  // The free tier can take 20-40 s per answer on a slow day.
  test.describe.configure({ timeout: 240_000 });
  const ANSWER_TIMEOUT = 90_000;

  test.describe('in the dashboard playground', () => {
    test.use({ storageState: SHARED_STATE });

    test('gets a cited answer the owner can trace to a passage', async ({ page }) => {
      await page.goto('/dashboard/playground');
      await page.getByRole('textbox', { name: 'Message' }).fill('How much is the Explorer plan?');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByText(/₹\s?1,299/).first()).toBeVisible({ timeout: ANSWER_TIMEOUT });
      const citation = page.getByRole('button', { name: /^Show source \d+$/ }).first();
      await expect(citation).toBeVisible();
      await expect(page.getByText('Cited', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(/^Searched docs for/).first()).toBeVisible(); // the agent's tool step

      // The chat's id is in the URL, so a reload brings the same conversation back from the database.
      await expect(page).toHaveURL(/\?c=/);
      await page.reload();
      await expect(page.getByText('How much is the Explorer plan?')).toBeVisible();

      // The overview counts the reply: its real latency and Gemini token usage, stored with it, add up there.
      await page.goto('/dashboard');
      const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'How much is the Explorer plan?' }) });
      await expect(row).toBeVisible();
      await expect(row.getByRole('cell').nth(4)).toHaveText(/^\$0\.0\d+$/); // fractions of a cent, never $0
      await expect(page.getByText('Response time (median)')).toBeVisible();
    });
  });

  test.describe('in the widget', () => {
    test('streams a cited answer, understands a follow-up and restores the chat after a reload', async ({ page }) => {
      await page.goto(shopUrl(sharedWorkspace().widgetKey));
      await page.getByRole('button', { name: 'Open chat' }).click();
      const input = page.getByRole('textbox', { name: 'Your message' });

      await input.fill('How much is the Explorer plan?');
      await input.press('Enter');
      const answer = page.locator('.message.assistant').nth(1); // 0 is the greeting
      await expect(answer).toContainText(/₹\s?1,299/, { timeout: ANSWER_TIMEOUT });
      // Customers see document titles only: no scores, no tool calls.
      await expect(answer.getByRole('list', { name: 'Sources' })).toContainText('BrewBox Help Center');
      await expect(answer).not.toContainText(/score|searchDocs/i);

      // "it" only makes sense with the history: the server loads it, the client sends just the text.
      await input.fill('Can I pause it?');
      await input.press('Enter');
      await expect(page.locator('.message.assistant').nth(2)).toContainText(/pause/i, { timeout: ANSWER_TIMEOUT });

      // The visitor token in localStorage brings the conversation back.
      await page.reload();
      await page.getByRole('button', { name: 'Open chat' }).click();
      await expect(page.locator('.message.user')).toHaveCount(2);
      await expect(page.locator('.message.user').first()).toHaveText('How much is the Explorer plan?');
    });

    test('hands off instead of guessing when the docs do not answer', async ({ page }) => {
      await page.goto(shopUrl(sharedWorkspace().widgetKey));
      await page.getByRole('button', { name: 'Open chat' }).click();
      const input = page.getByRole('textbox', { name: 'Your message' });

      await input.fill('Do you sell espresso machines?');
      await input.press('Enter');
      const reply = page.locator('.message.assistant').nth(1);
      await expect(reply).toContainText('a member of our team', { timeout: ANSWER_TIMEOUT });
      await expect(reply.getByRole('list', { name: 'Sources' })).toHaveCount(0); // nothing was cited
    });
  });
});

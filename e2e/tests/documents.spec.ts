import { expect, test } from '../fixtures';

/** Upload through the dashboard, processed by the real worker: extract, chunk, embed (Gemini), index (Atlas). */
test('uploads a document, shows it processing until ready, and deletes it', { tag: '@ai' }, async ({ page, owner }) => {
  test.setTimeout(150_000);
  await page.goto('/dashboard/documents');
  await expect(page.getByText(/No documents yet/)).toBeVisible();

  // setInputFiles on the hidden file input, as a file picked in the OS dialog would be.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'returns.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      `# Returns at ${owner.workspaceName}\n\nUnopened bags can be returned within 14 days for a full refund. ` +
        'Opened bags cannot be returned, but we replace damaged ones for free.\n',
    ),
  });

  const row = page.getByRole('row', { name: /returns/ });
  await expect(row).toContainText('Processing'); // the API answered 202 at once; the worker hasn't finished
  // The dashboard polls every 2 s while something is processing.
  await expect(row).toContainText('Ready', { timeout: 120_000 });
  await expect(row.getByRole('cell').nth(2)).toHaveText(/^[1-9]\d*$/); // at least one chunk

  await row.getByRole('button', { name: 'Delete returns' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/No documents yet/)).toBeVisible();
});

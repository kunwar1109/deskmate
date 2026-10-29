import { expect, shopUrl, test, widgetSettings } from '../fixtures';
import { API_URL } from '../urls';

/**
 * The widget on the fake customer site. Nothing here asks the AI a question.
 * The `owner` fixture signs up a fresh workspace and logs this browser in; page.request shares its cookie.
 */

test('loads in a shadow root, unaffected by the host CSS, with no API calls until opened', async ({ page, owner }) => {
  const { key } = await widgetSettings(page.request);
  const apiCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/public/')) apiCalls.push(req.url());
  });

  await page.goto(shopUrl(key));
  // Playwright's role locators pierce open shadow roots, like a screen reader does.
  const launcher = page.getByRole('button', { name: 'Open chat' });
  await expect(launcher).toBeVisible();
  expect(await page.evaluate(() => !!document.getElementById('deskmate-widget')?.shadowRoot)).toBe(true);

  // The host page styles every button lime with a dashed border and forces Comic Sans with !important.
  await expect(launcher).toHaveCSS('background-color', 'rgb(67, 56, 202)');
  await expect(launcher).toHaveCSS('border-style', 'none');
  expect(apiCalls).toEqual([]); // a page view costs the customer nothing until someone opens the chat

  await launcher.click();
  const dialog = page.getByRole('dialog', { name: `${owner.workspaceName} support chat` });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox', { name: 'Your message' });
  await expect(input).toBeFocused();
  await expect(input).not.toHaveCSS('font-family', /comic/i);
  expect(apiCalls.length).toBeGreaterThan(0); // the config request, now that it's open

  // Keyboard users: Escape closes the chat and puts focus back on the launcher.
  await input.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open chat' })).toBeFocused();
});

test.describe('on a phone', () => {
  // Phone-sized Chromium. (devices['iPhone 13'] would switch the browser to WebKit, which this project doesn't install.)
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the open chat fills the screen', async ({ page, owner }) => {
    const { key } = await widgetSettings(page.request);
    await page.goto(shopUrl(key));
    await page.getByRole('button', { name: 'Open chat' }).click();

    const dialog = page.getByRole('dialog', { name: /support chat/ });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width).toBe(page.viewportSize()?.width);
  });
});

test('the dashboard snippet carries the key, and a site off the allowlist is refused', async ({ page, owner }) => {
  await page.goto('/dashboard/widget');
  const { key } = await widgetSettings(page.request);
  await expect(page.getByText(`<script src="${API_URL}/widget.js" data-widget-key="${key}" async></script>`)).toBeVisible();

  // Lock the widget to another domain. The shop site (127.0.0.1:4173) is no longer allowed.
  await page.getByLabel('Allowed websites, one per line').fill('https://shop.example.com');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Allowed websites saved')).toBeVisible();

  await page.goto(shopUrl(key));
  await page.getByRole('button', { name: 'Open chat' }).click();
  // The browser enforces this: it sends the shop's real Origin header, and the API refuses it.
  await expect(page.getByRole('alert')).toHaveText(/This website is not allowed to use this widget/);
});

test('a new key turns the old snippet off', async ({ page, owner }) => {
  const { key: oldKey } = await widgetSettings(page.request);
  await page.goto('/dashboard/widget');
  await page.getByRole('button', { name: 'Get a new key' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace key' }).click();
  await expect(page.getByText('New key ready')).toBeVisible();

  const { key: newKey } = await widgetSettings(page.request);
  expect(newKey).not.toBe(oldKey);

  await page.goto(shopUrl(oldKey));
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Chat is unavailable right now/);

  await page.goto(shopUrl(newKey));
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByRole('textbox', { name: 'Your message' })).toBeVisible();
});

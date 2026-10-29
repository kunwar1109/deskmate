import { request as playwrightRequest } from '@playwright/test';
import { expect, signUp, test } from '../fixtures';
import { WEB_URL } from '../urls';

test('signs up, lands on the dashboard and logs out', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Ana');
  await page.getByLabel('Work email').fill(`ana-${crypto.randomUUID()}@example.com`);
  await page.getByLabel('Password').fill('a-long-password');
  await page.getByLabel('Company name').fill('Bean There');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL('/dashboard');
  // Rendered on the server from the session cookie the API just set.
  await expect(page.getByRole('heading', { name: 'Welcome, Ana. This is the Bean There workspace.' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  // The cookie is gone, so the dashboard sends us back to the login page.
  await page.goto('/dashboard/documents');
  await expect(page).toHaveURL('/login');
});

test('logs in, after refusing a wrong password', async ({ page }) => {
  // Create the account in a separate request context, so this browser starts logged out.
  const api = await playwrightRequest.newContext({ baseURL: WEB_URL });
  const owner = await signUp(api);
  await api.dispose();

  await page.goto('/login');
  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL('/login');

  await page.getByLabel('Password').fill(owner.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`This is the ${owner.workspaceName} workspace`) })).toBeVisible();
});

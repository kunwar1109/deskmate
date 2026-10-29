import { asVisitor, expect, SHARED_OWNER, SHARED_STATE, sharedWorkspace, shopUrl, test } from '../fixtures';

/**
 * Two browsers at once, like real life: a customer on the shop site and an agent in the dashboard inbox.
 * Every update crosses the system: widget -> API -> MongoDB -> Socket.io -> the other browser.
 */
test('a customer asks for a person, an agent replies live, then hands the chat back to the bot', { tag: '@ai' }, async ({ browser }) => {
  test.setTimeout(240_000);
  const { widgetKey } = sharedWorkspace();

  const agentContext = await browser.newContext({ storageState: SHARED_STATE });
  const agent = await agentContext.newPage();
  await agent.goto('/dashboard/inbox');
  await expect(agent.getByRole('tab', { name: 'Needs a human' })).toBeVisible();

  const customerContext = await browser.newContext();
  await asVisitor(customerContext);
  const customer = await customerContext.newPage();
  await customer.goto(shopUrl(widgetKey));
  await customer.getByRole('button', { name: 'Open chat' }).click();
  const input = customer.getByRole('textbox', { name: 'Your message' });

  // The first message becomes the chat's title in the inbox; the order number makes it unique to this run.
  const order = `BB-${Math.floor(10000 + Math.random() * 89999)}`;
  await input.fill(`Order ${order} arrived torn. Can I talk to a person?`);
  await input.press('Enter');
  await expect(customer.locator('.message.assistant').nth(1)).toContainText('a member of our team', { timeout: 90_000 });
  await expect(customer.getByRole('status')).toHaveText(/You're chatting with the BrewBox team/);

  // The agent's open dashboard hears about it without a reload.
  await expect(agent.getByText('A customer needs a human')).toBeVisible();
  await agent.getByRole('link', { name: new RegExp(`Order ${order}`) }).click();

  // While a person handles the chat, the bot stays quiet: the customer's message reaches the agent live, unanswered.
  await input.fill('It was the Explorer box.');
  await input.press('Enter');
  await expect(agent.getByText('It was the Explorer box.')).toBeVisible();
  // Proving that something did NOT happen: don't sleep and hope, wait for the request to finish. The log is
  // aria-busy until the reply stream closes, and the agent seeing the message means the request is in flight.
  // Silent bot: the stream closes at once, empty. A bot that wrongly answered closes only after its reply.
  await expect(customer.getByRole('log')).toHaveAttribute('aria-busy', 'false', { timeout: 90_000 });
  await expect(customer.locator('.message.assistant')).toHaveCount(2); // greeting + handoff, nothing new

  // The agent's reply appears in the widget with their name.
  await agent.getByRole('textbox', { name: 'Your reply' }).fill('Sorry about that! A replacement ships today.');
  await agent.getByRole('button', { name: 'Send reply' }).click();
  const human = customer.locator('.message.assistant').filter({ hasText: 'A replacement ships today.' });
  await expect(human).toContainText(`${SHARED_OWNER.name} · BrewBox`);

  // Hand back: the banner goes away in the widget, again without a reload.
  await agent.getByRole('button', { name: 'Hand back to bot' }).click();
  await expect(customer.getByRole('status')).toBeHidden();

  await agentContext.close();
  await customerContext.close();
});

import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/catalog', (route) => route.fulfill({ json: { repositories: [] } }));
  await page.route('**/api/releases', (route) => route.fulfill({ json: { releases: [] } }));
});

test('navbar shows the signed-in user after login and reload, and supports logout', async ({ page }) => {
  let user = '';
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: true, authType: 'basic', user, deleteEnabled: false } }),
  );
  await page.route('**/api/auth/login', async (route) => {
    user = route.request().postDataJSON().username;
    await route.fulfill({ json: { username: user } });
  });
  await page.route('**/api/auth/logout', async (route) => {
    expect(route.request().method()).toBe('POST');
    user = '';
    await route.fulfill({ json: {} });
  });
  await page.goto('/login');
  const account = page.getByRole('button', { name: 'Account', exact: true });
  await expect(account).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill('developer');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(account).toHaveText('developer');
  await page.reload();
  await expect(account).toHaveText('developer');
  await account.click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(account).toHaveCount(0);
});

test('long usernames truncate on mobile without horizontal overflow', async ({ page }) => {
  const user = 'developer-with-a-very-long-username@example.company.internal';
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: true, authType: 'basic', user, deleteEnabled: false } }),
  );
  await page.goto('/settings');
  const account = page.getByRole('button', { name: 'Account', exact: true });
  await expect(account).toHaveText(user);
  await expect(account).toHaveAttribute('title', user);
  const label = account.locator('[data-slot="label"]');
  await expect(label).toBeVisible();
  expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await account.click();
  await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('anonymous registries show no account menu', async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  );
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toHaveCount(0);
});

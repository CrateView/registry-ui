import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('full-page sign-in preserves branding and website access on mobile', async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: true, authType: 'basic', user: '', deleteEnabled: false } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('header img')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Visit website' })).toHaveAttribute('href', 'https://crateview.de/');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Search repositories/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('This field is required.')).toHaveCount(2);
});

test('standalone sign-in initializes authentication and submits credentials', async ({ page }) => {
  let user = '';
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: !user, authType: 'basic', user, deleteEnabled: false } }),
  );
  await page.route('**/api/registry/catalog', (route) => route.fulfill({ json: { repositories: [] } }));
  await page.route('**/api/auth/login', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      username: 'developer',
      password: 'test-password',
    });
    user = 'developer';
    await route.fulfill({ json: { username: user } });
  });
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('developer');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toContainText('developer');
});

test('unsupported registry authentication does not display a credential form', async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: { auth: true, authType: 'unsupported', user: '', deleteEnabled: false },
    }),
  );
  await page.goto('/login');
  await expect(page.getByText(/This registry requires an external token service/)).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });
const release = {
  version: '99.0.0',
  publishedAt: '2026-11-01T00:00:00Z',
  markdown: '**New feature**\n\n<script>alert(1)</script>',
  url: 'https://github.com/crateview/registry-ui/releases/tag/v99.0.0',
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/status', (route) => route.fulfill({ json: { auth: false, deleteEnabled: false } }));
});
test('version opens accessible changelog; update survives closing and navigation', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/releases', (route) => {
    requests++;
    return route.fulfill({ json: { releases: [release] } });
  });
  await page.goto('/home');
  const trigger = page.getByRole('button', { name: /Open changelog for v/ });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('status', { name: 'Update available: v99.0.0' })).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('strong')).toHaveText('New feature');
  await expect(page.getByRole('dialog').locator('script')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('link', { name: 'Explore', exact: true }).click();
  await expect(trigger).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(trigger).toBeHidden();
});
test('failure retries into empty state with GitHub link', async ({ page }) => {
  await page.route('**/api/releases', (route) => route.fulfill({ status: 502, json: {} }));
  await page.goto('/home');
  await page.getByRole('button', { name: /Open changelog/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Changelog unavailable.');
  await page.route('**/api/releases', (route) => route.fulfill({ json: { releases: [] } }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No releases published yet.');
  await expect(page.getByRole('link', { name: 'All GitHub releases' })).toBeVisible();
});
test('German mobile sidebar opens changelog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: 'registry-ui-language', value: 'de', url: 'http://localhost:3000' }]);
  await page.route('**/api/releases', (route) => route.fulfill({ json: { releases: [release] } }));
  await page.goto('/home');
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await page.getByRole('button', { name: /Changelog für v/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Was ist neu?');
});

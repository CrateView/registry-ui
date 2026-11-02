import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: { auth: false, user: '', deleteEnabled: false, monitoringEnabled: true },
    }),
  );
  await page.route('**/api/monitoring/overview?*', (route) =>
    route.fulfill({
      json: {
        startedAt: Date.now(),
        lastSuccessAt: null,
        latest: null,
        sources: { metrics: false, events: false, collectorError: null, lastEventAt: null },
        totals: null,
        activity: [],
        series: [],
      },
    }),
  );
  await page.route('**/api/registry/catalog', (route) => route.fulfill({ json: { repositories: [] } }));
});

test('sidebar collapse, resize, persistence and keyboard search', async ({ page }) => {
  await page.goto('/home');
  const sidebar = page.locator('#crateview-dashboard-sidebar-registry');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const initialWidth = (await sidebar.boundingBox())!.width;
  const handle = page.locator('[data-slot="handle"]').first();
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 50, bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
  const resizedWidth = (await sidebar.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(initialWidth + 30);
  await page.reload();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(resizedWidth);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.reload();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.keyboard.press('Control+k');
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  const search = page.getByRole('textbox', { name: 'Search repositories or images…' });
  await expect(search).toBeFocused();
  await search.fill('missing');
  await page.getByRole('option', { name: 'Search results: missing', exact: true }).click();
  await expect(page).toHaveURL(/explore\?search=missing/);
});

test('mobile sidebar closes after navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /Search/ })).toBeVisible();
  await dialog.getByRole('link', { name: 'Explore', exact: true }).click();
  await expect(page).toHaveURL(/explore/);
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  await dialog.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('settings controls persist theme and language across navigation and reload', async ({ page }) => {
  await page.goto('/home');
  const sidebar = page.locator('#crateview-dashboard-sidebar-registry');
  await expect(sidebar.getByRole('button', { name: 'Color mode', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Documentation', exact: true })).toHaveAttribute('target', '_blank');
  await expect(sidebar.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('target', '_blank');
  await sidebar.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('button', { name: 'Color mode', exact: true }).click();
  await page.getByRole('option', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: /Deutsch/ }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Farbmodus', exact: true })).toContainText('Dunkel');
  await sidebar.getByRole('link', { name: 'Übersicht', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

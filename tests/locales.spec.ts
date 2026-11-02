import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { supportedLocales } from '../shared/locales';

const messages = (code: string) =>
  JSON.parse(readFileSync(new URL(`../i18n/locales/${code}.json`, import.meta.url), 'utf8')) as Record<string, string>;
test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  );
  await page.route('**/api/registry/catalog', (route) => route.fulfill({ json: { repositories: [] } }));
  await page.route('**/api/releases', (route) => route.fulfill({ json: { releases: [] } }));
});
for (const locale of supportedLocales) {
  test(`${locale.code}: translated settings and language persistence`, async ({ page, context }) => {
    await context.addCookies([{ name: 'registry-ui-language', value: locale.code, url: 'http://localhost:3000' }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: messages(locale.code).settings, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: messages(locale.code).settings, exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: messages(locale.code).language, exact: true }).click();
    await page.getByRole('option', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect
      .poll(async () => (await context.cookies()).find((cookie) => cookie.name === 'registry-ui-language')?.value)
      .toBe('en');
  });
}

test('Arabic browser preference and mobile sidebar follow RTL', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ar', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  );
  await page.route('**/api/releases', (route) => route.fulfill({ json: { releases: [] } }));
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.getByRole('button', { name: messages('ar').navigation, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = (await dialog.boundingBox())!;
      return Math.round(bounds.x + bounds.width);
    })
    .toBe(390);
  await context.close();
});

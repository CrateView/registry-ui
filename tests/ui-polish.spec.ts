import { expect, test, type Page } from '@playwright/test';

const names = Array.from({ length: 26 }, (_, i) => `demo/repo-${String(i).padStart(2, '0')}`);
const images = Array.from({ length: 26 }, (_, i) => ({
  RepoName: names[0],
  Tag: `v${String(i).padStart(2, '0')}`,
  Digest: `sha256:${String(i).padStart(64, '0')}`,
  LastUpdated: '2026-04-16T00:00:00Z',
  Size: 1024,
  Manifests: [{ Digest: `sha256:${i}`, Platform: { Os: 'linux', Arch: 'amd64' } }],
}));

async function setup(page: Page, repositories = names) {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: {
        auth: true,
        user: 'admin',
        authType: 'basic',
        userManagement: true,
        canCreateUsers: true,
        deleteEnabled: true,
        monitoringEnabled: false,
      },
    }),
  );
  await page.route('**/api/account/users', (route) => route.fulfill({ json: { users: [{ username: 'admin' }] } }));
  await page.route('**/api/registry/catalog', (route) => route.fulfill({ json: { repositories } }));
  await page.route('**/api/registry/repository?*', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name');
    return route.fulfill({
      json: {
        Summary: { Name: name, TagCount: images.length, Platforms: [{ Os: 'linux', Arch: 'amd64' }] },
        Images: images,
      },
    });
  });
}

test.use({ locale: 'en-US' });

for (const locale of ['en', 'de', 'ar']) {
  test(`table headings and cells align in ${locale}`, async ({ page }) => {
    await setup(page);
    await page
      .context()
      .addCookies([{ name: 'registry-ui-language', value: locale, url: test.info().project.use.baseURL! }]);
    if (locale === 'de') await page.setViewportSize({ width: 390, height: 844 });
    for (const [path, alignment] of [
      ['/users', ['start', 'right']],
      ['/explore', ['start', 'start', 'center', 'right']],
      [`/image/${encodeURIComponent(names[0]!)}`, ['start', 'start', 'start', 'center', 'right', 'start', 'right']],
    ] as const) {
      await page.goto(path);
      const table = page.locator('table.data-table').first();
      await expect(table.locator('tbody tr').first()).toBeVisible();
      await expect
        .poll(() =>
          table.locator('thead th').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign)),
        )
        .toEqual([...alignment]);
      const row = path === '/explore' ? table.locator('tbody tr').nth(1) : table.locator('tbody tr').first();
      const cells = await row
        .locator('td')
        .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign));
      // Table defaults can compute to start or an equivalent physical direction.
      alignment.forEach((expected, index) => {
        if (expected !== 'start') expect(cells[index]).toBe(expected);
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

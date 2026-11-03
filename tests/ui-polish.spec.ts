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

for (const count of [0, 1, 12, 13, 26]) {
  test(`repository range counts ${count} repositories, excluding folders`, async ({ page }) => {
    await setup(page, names.slice(0, count));
    await page.goto('/explore');
    const range = page.getByTestId('result-range');
    await expect(range).toHaveText(`Showing ${count ? 1 : 0}–${Math.min(12, count)} of ${count}`);
    if (count > 12) {
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      await expect(range).toHaveText(`Showing ${Math.floor((count - 1) / 12) * 12 + 1}–${count} of ${count}`);
      await page.getByRole('textbox', { name: 'Search repositories or images…' }).fill('repo-00');
      await expect(range).toHaveText('Showing 1–1 of 1');
    }
  });
}

test('live search debounces, clears, preserves queries and supports tag results', async ({ page }) => {
  await setup(page);
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/registry/repository?')) requests++;
  });
  await page.goto('/explore?keep=present');
  const search = page.getByRole('textbox', { name: 'Search repositories or images…' });
  const range = page.getByTestId('result-range');
  await expect(range).toHaveText('Showing 1–12 of 26');
  expect(await page.getByRole('button', { name: 'Search results', exact: true }).count()).toBe(0);
  const before = requests;
  await search.fill('repo-1');
  await search.fill('repo-20');
  await expect(range).toHaveText('Showing 1–1 of 1');
  expect(requests - before).toBe(1);
  await expect(page).toHaveURL(/keep=present.*search=repo-20/);
  await search.fill('');
  await expect(range).toHaveText('Showing 1–12 of 26');
  await expect(page).toHaveURL(/explore\?keep=present$/);
  await search.fill(`${names[0]}:v25`);
  await expect(range).toHaveText('Showing 1–1 of 1');
  await expect(page.getByRole('link', { name: 'v25', exact: true })).toBeVisible();
  await search.fill('missing');
  await expect(range).toHaveText('Showing 0–0 of 0');
  await search.fill('x'.repeat(513));
  await expect(search).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('typing back to the applied term cancels an earlier draft', async ({ page }) => {
  await setup(page);
  await page.goto('/explore?search=repo-00');
  const range = page.getByTestId('result-range');
  await expect(range).toHaveText('Showing 1–1 of 1');
  const search = page.getByRole('textbox', { name: 'Search repositories or images…' });
  await search.fill('repo-01');
  await search.fill('repo-00');
  await expect(range).toHaveText('Showing 1–1 of 1');
  await expect(search).toHaveValue('repo-00');
  await expect(page.getByRole('link', { name: 'repo-00', exact: true })).toBeVisible();
});

test('stale responses cannot overwrite a newer search, including its debounce window', async ({ page }) => {
  await setup(page);
  let release: (() => void) | undefined;
  let requested: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/registry/repository?*', async (route) => {
    const name = new URL(route.request().url()).searchParams.get('name');
    if (name === names[0]) {
      requested!();
      await blocked;
    }
    await route.fulfill({ json: { Summary: { Name: name, TagCount: 0, Platforms: [] }, Images: [] } });
  });
  await page.goto('/explore?search=repo-00');
  await started;
  await page.getByRole('textbox', { name: 'Search repositories or images…' }).fill('repo-25');
  release!();
  await expect(page.getByRole('link', { name: 'repo-00', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'repo-25', exact: true })).toBeVisible();
});

test('URL navigation restores search and catalog failures can retry', async ({ page }) => {
  await setup(page);
  let failed = false;
  await page.route('**/api/registry/catalog', (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, json: {} });
    }
    return route.fulfill({ json: { repositories: names } });
  });
  await page.goto('/explore?search=repo-00');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('result-range')).toHaveText('Showing 1–1 of 1');
  await page.evaluate(() => history.pushState({}, '', '/explore?search=repo-25&keep=present'));
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Search repositories or images…' })).toHaveValue('repo-00');
  await page.goForward();
  await expect(page.getByRole('textbox', { name: 'Search repositories or images…' })).toHaveValue('repo-25');
  await expect(page.getByRole('link', { name: 'repo-25', exact: true })).toBeVisible();
});

test('tag pagination shows ranges and resets after filtering', async ({ page }) => {
  await setup(page);
  await page.goto(`/image/${encodeURIComponent(names[0]!)}`);
  const range = page.getByTestId('result-range');
  await expect(range).toHaveText('Showing 1–12 of 26');
  await page.getByRole('button', { name: 'Last page', exact: true }).click();
  await expect(range).toHaveText('Showing 25–26 of 26');
  await page.getByRole('textbox', { name: 'Tags', exact: true }).fill('v00');
  await expect(range).toHaveText('Showing 1–1 of 1');
  await page.getByRole('textbox', { name: 'Tags', exact: true }).fill('missing');
  await expect(range).toHaveText('Showing 0–0 of 0');
});

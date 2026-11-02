import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

const base = 'http://localhost:3001';
test.use({ locale: 'en-US' });
async function login(page: import('@playwright/test').Page) {
  await page.goto(`${base}/login`);
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('developer');
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
}
test('native Basic Auth, encrypted HttpOnly session, namespaces, alias-safe deletion and logout', async ({
  page,
  context,
  request,
}) => {
  await login(page);
  await expect(page).toHaveTitle(/Acme Containers/);
  const cookie = (await context.cookies()).find((cookie) => cookie.name === 'registry-ui-session');
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('registry-ui-session');
  await page.goto(`${base}/image/team%2Fimage`);
  await expect(page.getByRole('heading', { name: 'team/image', level: 1 })).toBeVisible();
  await page.goto(`${base}/image/deletable/tag/latest`);
  await page.getByRole('button', { name: 'Delete manifest', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('latest, v1');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/\/image\/deletable$/);
  await expect(page.getByRole('link', { name: 'v1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  expect((await request.get(`${base}/api/registry/catalog`)).status()).toBe(401);
});
test('multi-platform OCI index and actual SBOM referrers', async ({ page }) => {
  await login(page);
  await page.goto(`${base}/image/alpine/tag/multi`);
  await page.getByRole('combobox', { name: 'Platform', exact: true }).click();
  await page.getByRole('option', { name: /linux\/arm64/ }).click();
  await expect(page.getByText('linux/arm64', { exact: true })).toBeVisible();
  await page.goto(`${base}/image/alpine/tag/latest`);
  await page.getByRole('button', { name: 'Referrers', exact: true }).click();
  await expect(page.getByText('Fixture SBOM', { exact: true })).toBeVisible();
});
test('cross-origin mutations are rejected', async ({ request }) => {
  const response = await request.post(`${base}/api/auth/login`, {
    headers: { origin: 'https://evil.example' },
    data: { username: 'developer', password: 'test-password' },
  });
  expect(response.status()).toBe(403);
});

test('native upload streaming, Location rewriting and blob download through the UI proxy', async ({ request }) => {
  expect(
    (
      await request.post(`${base}/api/auth/login`, {
        data: { username: 'developer', password: 'test-password' },
      })
    ).status(),
  ).toBe(200);
  const data = Buffer.alloc(256 * 1024, 65);
  const digest = 'sha256:' + createHash('sha256').update(data).digest('hex');
  const response = await request.post(`${base}/v2/proxy-check/blobs/uploads/`);
  expect(response.status()).toBe(202);
  const location = new URL(response.headers().location!);
  expect(location.origin).toBe(base);
  location.searchParams.set('digest', digest);
  expect(
    (
      await request.put(location.href, {
        headers: { 'Content-Type': 'application/octet-stream' },
        data,
      })
    ).status(),
  ).toBe(201);
  const download = await request.get(`${base}/v2/proxy-check/blobs/${digest}`);
  expect(download.status()).toBe(200);
  expect(await download.body()).toEqual(data);
});

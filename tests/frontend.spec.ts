import { test, expect } from '@playwright/test'
test.use({ locale: 'en-US' })
test('official registry: catalog, tags, manifest, config and layer history', async ({
  page,
  request,
}) => {
  expect((await (await request.get('/v2/_catalog')).json()).repositories).toContain('alpine')
  expect(
    (
      await request.get('/v2/alpine/manifests/latest', {
        headers: { Accept: 'application/vnd.oci.image.manifest.v1+json' },
      })
    ).status(),
  ).toBe(200)
  await page.goto('/home')
  await page
    .getByRole('link', { name: /alpine/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'alpine', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'latest', exact: true }).click()
  await expect(page.getByText(/alpine-minirootfs/).first()).toBeVisible()
  await expect(
    page.getByText('docker pull localhost:3000/alpine:latest', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vulnerabilities', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete manifest', exact: true })).toHaveCount(0)
})
test('repository search and empty states', async ({ page }) => {
  await page.goto('/explore?search=missing-repository')
  await expect(page.getByRole('heading', { name: 'No results found', exact: true })).toBeVisible()
  await page.goto('/explore?search=alpine')
  await expect(page.getByRole('heading', { name: 'alpine', exact: true })).toBeVisible()
})
test('system theme follows OS and overrides survive reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/home')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.getByRole('button', { name: 'System', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
})
test('German, language persistence and mobile navigation', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'de-DE',
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Navigation', exact: true }).click()
  await page.getByRole('combobox', { name: 'Sprache' }).click()
  await page.getByRole('option', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Navigation', exact: true }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page).toHaveURL(/explore/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await context.close()
})

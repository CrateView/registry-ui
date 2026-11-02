import { expect, test } from '@playwright/test'
const at = Date.now()
const payload = {
  startedAt: at - 86400000,
  lastSuccessAt: at,
  latest: {
    at,
    reachable: true,
    authRequired: true,
    latencyMs: 12.5,
    probeError: null,
    metricsError: null,
    storage: null,
  },
  sources: { metrics: true, events: true, collectorError: null, lastEventAt: at },
  totals: { push: 2, pull: 5 },
  activity: [
    {
      id: 'event',
      at,
      action: 'push',
      repository: 'team/image',
      tag: 'latest',
      digest: 'sha256:' + 'a'.repeat(64),
    },
  ],
  series: [
    {
      at: at - 3600000,
      push: 2,
      pull: 5,
      operationsPerSecond: 0.5,
      meanDurationMs: 12,
      gap: false,
    },
    { at, push: null, pull: null, operationsPerSecond: null, meanDurationMs: null, gap: true },
  ],
}
test.use({ locale: 'en-US' })
test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: { auth: false, user: '', deleteEnabled: false, monitoringEnabled: true },
    }),
  )
  await page.route('**/api/monitoring/overview?*', (route) => route.fulfill({ json: payload }))
  await page.route('**/api/registry/catalog', (route) =>
    route.fulfill({ json: { repositories: [] } }),
  )
})
test('operational dashboard, range selection and accessible missing values', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByText('Reachable · authentication required', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'team/image', exact: true })).toHaveAttribute(
    'href',
    '/image/team%2Fimage',
  )
  await expect(page.getByRole('img', { name: /Expand the data table/ })).toHaveCount(3)
  await page.getByText('Show data table', { exact: true }).first().click()
  await expect(page.getByRole('table').first()).toContainText('—')
  await page.getByRole('combobox', { name: 'Monitoring time range' }).click()
  const request = page.waitForRequest('**/api/monitoring/overview?range=7d')
  await page.getByRole('option', { name: '7 days', exact: true }).click()
  await request
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page).toHaveURL(/explore/)
})
test('disabled dashboard redirects and hides navigation', async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', monitoringEnabled: false } }),
  )
  await page.goto('/home')
  await expect(page).toHaveURL(/explore/)
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveCount(0)
})
test('partial sources and storage errors remain visible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/monitoring/overview?*', (route) =>
    route.fulfill({
      json: {
        ...payload,
        sources: { ...payload.sources, collectorError: 'databaseFailed' },
        latest: { ...payload.latest, metricsError: 'metricsFailed' },
      },
    }),
  )
  await page.goto('/home')
  await expect(
    page.getByText('Monitoring storage failed. Collection or event delivery is impaired.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Measurements are stale, incomplete or unavailable.', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('German labels and unconfigured sources preserve unknown values', async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([{ name: 'registry-ui-language', value: 'de', url: baseURL! }])
  await page.route('**/api/monitoring/overview?*', (route) =>
    route.fulfill({
      json: {
        ...payload,
        latest: null,
        sources: { metrics: false, events: false, collectorError: null, lastEventAt: null },
        totals: null,
        activity: [],
        series: [],
      },
    }),
  )
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible()
  await expect(page.getByText('Unbekannt / veraltet', { exact: true })).toBeVisible()
  await expect(page.getByText('Keine Messwerte verfügbar.', { exact: true })).toHaveCount(3)
  await expect(page.getByText('Nicht konfiguriert', { exact: true })).toBeVisible()
})

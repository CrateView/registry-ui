import { test, expect } from '@playwright/test'

const packages = [
  {
    name: '@example/package',
    version: '1.2.3',
    license: 'MIT',
    url: 'https://example.com/',
    documents: [
      { file: 'LICENSE', text: 'Copyright Example\n<script>license text</script>\n' },
      { file: 'NOTICE', text: 'Example attribution' },
    ],
  },
  { name: 'optional-package', version: '2.0.0', license: '', url: '', documents: [] },
]
test.use({ locale: 'en-US' })
test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  )
})

test('loads licenses on expansion, searches and displays verbatim license and notice text', async ({
  page,
}) => {
  let requests = 0
  let release = () => {}
  const responseReady = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/dependency-licenses.json', async (route) => {
    requests++
    await responseReady
    return route.fulfill({ json: packages })
  })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible()
  expect(requests).toBe(0)
  await page.getByText('Dependency licenses', { exact: true }).click()
  await expect(page.getByText('Loading licenses…', { exact: true })).toBeVisible()
  release()
  await expect(page.getByText('2 of 2 dependency versions', { exact: true })).toBeVisible()
  await page.getByText('@example/package', { exact: true }).click()
  await expect(page.locator('pre').first()).toBeVisible()
  expect(await page.locator('pre').first().textContent()).toBe(packages[0].documents[0].text)
  await expect(page.getByText('Example attribution', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Project website' })).toHaveAttribute(
    'href',
    'https://example.com/',
  )
  const search = page.getByRole('textbox', { name: 'Search packages, versions or licenses…' })
  await search.fill('2.0.0')
  await page.getByText('optional-package', { exact: true }).click()
  await expect(page.getByText('License text unavailable in the installed package.')).toBeVisible()
  await search.fill('BSD')
  await expect(page.getByText('No dependencies found.', { exact: true })).toBeVisible()
  await search.fill('mit')
  await expect(page.getByText('1 of 2 dependency versions', { exact: true })).toBeVisible()
  await page.getByText('Dependency licenses', { exact: true }).click()
  await page.getByText('Dependency licenses', { exact: true }).click()
  expect(requests).toBe(1)
})

test('shows load failures and allows retry including an empty inventory', async ({ page }) => {
  await page.route('**/dependency-licenses.json', (route) => route.fulfill({ status: 404 }))
  await page.goto('/settings')
  await page.getByText('Dependency licenses', { exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load dependency licenses.')
  await page.route('**/dependency-licenses.json', (route) => route.fulfill({ json: [] }))
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('No dependencies found.', { exact: true })).toBeVisible()
})

test('German mobile view wraps long license content without horizontal overflow', async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: 'de-DE',
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  )
  await page.route('**/dependency-licenses.json', (route) =>
    route.fulfill({
      json: [
        {
          ...packages[0],
          name: 'long-package-name-'.repeat(20),
          documents: [{ file: 'LICENSE', text: 'x'.repeat(1000) }],
        },
      ],
    }),
  )
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Über', exact: true })).toBeVisible()
  await page.getByText('Dependency-Lizenzen', { exact: true }).click()
  await page.getByText('long-package-name-'.repeat(20), { exact: true }).click()
  await expect(page.locator('pre')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await context.close()
})

import { test, expect } from '@playwright/test'

test.use({ locale: 'en-US' })
test.beforeEach(async ({ page }) => {
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  )
  await page.route('**/api/registry/catalog', (route) =>
    route.fulfill({ json: { repositories: [] } }),
  )
})

test('sidebar collapse, resize, persistence and keyboard search', async ({ page }) => {
  await page.goto('/home')
  const sidebar = page.locator('#crateview-dashboard-sidebar-registry')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  const initialWidth = (await sidebar.boundingBox())!.width
  const handle = page.locator('[data-slot="handle"]').first()
  const bounds = (await handle.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 50, bounds.y + bounds.height / 2, { steps: 10 })
  await page.mouse.up()
  const resizedWidth = (await sidebar.boundingBox())!.width
  expect(resizedWidth).toBeGreaterThan(initialWidth + 30)
  await page.reload()
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(resizedWidth)
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
  await page.reload()
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
  await page.keyboard.press('Control+k')
  await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
  const search = page.getByRole('textbox', { name: 'Search repositories or images…' })
  await expect(search).toBeFocused()
  await search.fill('missing')
  await search.press('Enter')
  await expect(page).toHaveURL(/explore\?search=missing/)
})

test('mobile sidebar closes after navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home')
  await page.getByRole('button', { name: 'Navigation', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: /Search/ })).toBeVisible()
  await dialog.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page).toHaveURL(/explore/)
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

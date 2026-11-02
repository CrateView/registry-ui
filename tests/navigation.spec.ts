import { test, expect, type Page } from '@playwright/test'
const digest = 'sha256:' + 'a'.repeat(64)
test.use({ locale: 'en-US' })
async function setup(page: Page, allowed = true) {
  let signedIn = true
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: {
        auth: true,
        user: signedIn ? 'admin' : '',
        authType: 'basic',
        userManagement: signedIn,
        canCreateUsers: signedIn && allowed,
        monitoringEnabled: true,
        deleteEnabled: false,
      },
    }),
  )
  await page.route('**/api/auth/logout', async (route) => {
    signedIn = false
    await route.fulfill({ json: { ok: true } })
  })
  await page.route('**/api/account/users', (route) =>
    route.fulfill({ json: { users: [{ username: 'admin' }] } }),
  )
  await page.route('**/api/monitoring/overview?*', (route) =>
    route.fulfill({
      json: {
        startedAt: Date.now(),
        latest: null,
        sources: {},
        totals: null,
        activity: [],
        series: [],
      },
    }),
  )
  await page.route('**/api/registry/catalog', (route) =>
    route.fulfill({ json: { repositories: [] } }),
  )
  await page.route('**/api/registry/repository?*', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name')!
    return route.fulfill({
      json: { Summary: { Name: name, TagCount: 0, Platforms: [] }, Images: [] },
    })
  })
  await page.route('**/api/registry/image?*', (route) =>
    route.fulfill({
      json: { RepoName: 'demo/backend', Tag: 'latest', Digest: digest, Manifests: [], Size: '0' },
    }),
  )
}

test('one compact navigation menu, settings last, with collapsed links preserved', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/users')
  const navigation = page.getByRole('navigation', { name: 'Navigation', exact: true })
  await expect(navigation.getByRole('link')).toHaveText([
    'Overview',
    'Explore',
    'Users',
    'Settings',
  ])
  await expect(navigation.getByText('Administration', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Administration', exact: true })).toHaveCount(0)
  const explore = await navigation.getByRole('link', { name: 'Explore', exact: true }).boundingBox()
  const users = await navigation.getByRole('link', { name: 'Users', exact: true }).boundingBox()
  expect(users!.y - (explore!.y + explore!.height)).toBeLessThan(60)
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(navigation.getByText('Administration', { exact: true })).toBeHidden()
  await expect(navigation.locator('a[href="/users"]')).toBeVisible()
  await expect(navigation.locator('a[href="/settings"]')).toBeVisible()
})

test('breadcrumb hierarchy and parent links across dashboard pages', async ({ page }) => {
  await setup(page)
  for (const [path, labels] of [
    ['/home', ['Overview']],
    ['/explore', ['Home', 'Explore']],
    ['/settings', ['Home', 'Administration', 'Settings']],
    ['/users', ['Home', 'Administration', 'Users']],
    ['/account', ['Home', 'Account']],
    ['/image/demo%2Fbackend', ['Home', 'Explore', 'demo/backend']],
    ['/image/demo%2Fbackend/tag/latest', ['Home', 'Explore', 'demo/backend', 'latest']],
  ] as const) {
    await page.goto(path)
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb', exact: true })
    await expect(breadcrumb.locator('[data-slot="linkLabel"]')).toHaveText([...labels])
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(labels.at(-1)!)
    await expect(breadcrumb.locator('[aria-current="page"]')).not.toHaveAttribute('href')
  }
  const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb', exact: true })
  await breadcrumb.getByRole('link', { name: 'demo/backend', exact: true }).click()
  await expect(page).toHaveURL(/\/image\/demo%2Fbackend$/)
  await breadcrumb.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page).toHaveURL(/\/explore$/)
})

test('mobile German breadcrumbs retain full repository and digest titles without overflow', async ({
  page,
}) => {
  await setup(page)
  await page
    .context()
    .addCookies([{ name: 'registry-ui-language', value: 'de', url: 'http://localhost:3000' }])
  await page.setViewportSize({ width: 390, height: 844 })
  const name = 'team/' + 'a'.repeat(100) + '/nested'
  await page.goto(`/image/${encodeURIComponent(name)}/tag/${encodeURIComponent(digest)}`)
  const nav = page.locator('nav').filter({ has: page.locator(`[title="${digest}"]`) })
  await expect(nav).toContainText('Entdecken')
  await expect(nav.locator(`[title="${name}"]`)).toBeVisible()
  await expect(nav.locator(`[title="${digest}"]`)).toBeVisible()
  await expect(nav.locator('[aria-current="page"]')).toHaveText(digest)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('sign out is red, separated, and clears the signed-in state', async ({ page }) => {
  await setup(page)
  await page.goto('/account')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const menu = page.getByRole('menu')
  const signOut = menu.getByRole('menuitem', { name: 'Sign out', exact: true })
  await expect(signOut).toHaveClass(/text-error/)
  await expect(menu.getByRole('separator')).toBeVisible()
  const separator = await menu.getByRole('separator').boundingBox()
  const item = await signOut.boundingBox()
  expect(separator!.y).toBeLessThan(item!.y)
  await signOut.click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
})

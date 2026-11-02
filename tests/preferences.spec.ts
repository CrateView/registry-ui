import { test, expect, type Page } from '@playwright/test'
test.use({ locale: 'en-US', colorScheme: 'light', reducedMotion: 'no-preference' })
async function setup(page: Page, signedIn = true) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('registry-ui-color-mode'))
      localStorage.setItem('registry-ui-color-mode', 'light')
    const start = document.startViewTransition?.bind(document)
    const animate = Element.prototype.animate
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options)
      if (typeof options === 'object' && options.pseudoElement === '::view-transition-new(root)') {
        const state = (window as unknown as { themeTransitions: { reveals: number } })
          .themeTransitions
        state.reveals++
      }
      return animation
    }
    Object.defineProperty(window, 'themeTransitions', {
      value: { count: 0, reveals: 0 },
      configurable: true,
    })
    if (start)
      document.startViewTransition = (...args) => {
        // Count actual browser transitions without replacing their animation behavior.
        const state = (window as unknown as { themeTransitions: { count: number } })
          .themeTransitions
        state.count++
        return start(...args)
      }
  })
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: {
        auth: true,
        user: signedIn ? 'admin' : '',
        authType: 'basic',
        userManagement: signedIn,
        canCreateUsers: signedIn,
        deleteEnabled: false,
      },
    }),
  )
  await page.route('**/api/registry/catalog', (route) =>
    route.fulfill({ json: { repositories: [] } }),
  )
}
const transitions = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { themeTransitions: { count: number } }).themeTransitions.count,
  )

test('account menu has CRM language and theme submenus without a duplicate username', async ({
  page,
}) => {
  await setup(page)
  await page.goto('/account')
  const trigger = page.getByRole('button', { name: 'Account', exact: true })
  await trigger.click()
  await expect(page.getByRole('menu').getByText('admin', { exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Color mode', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Light', exact: true })).toBeChecked()
  await page.getByRole('menuitemcheckbox', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('menuitemcheckbox', { name: 'Dark', exact: true })).toBeChecked()
  expect(await transitions(page)).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { themeTransitions: { reveals: number } }).themeTransitions.reveals,
      ),
    )
    .toBe(1)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Language', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'English', exact: true })).toBeChecked()
  await page.getByRole('menuitemcheckbox', { name: 'Deutsch', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.getByRole('menuitemcheckbox', { name: 'Deutsch', exact: true })).toBeChecked()
  await expect(page.getByRole('menuitem', { name: 'Abmelden', exact: true })).toHaveClass(
    /text-error/,
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Konto', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Konto', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sprache', exact: true }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Deutsch', exact: true })).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('settings animate theme changes and follow system preference', async ({ page }) => {
  await setup(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Color mode', exact: true }).click()
  await page.getByRole('option', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await transitions(page)).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { themeTransitions: { reveals: number } }).themeTransitions.reveals,
      ),
    )
    .toBe(1)
  await page.getByRole('button', { name: 'Color mode', exact: true }).click()
  await page.getByRole('option', { name: 'System', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Color mode', exact: true })).toContainText(
    'System',
  )
})

test('the sign-in theme toggle uses the shared transition', async ({ page }) => {
  await setup(page, false)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Color mode', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await transitions(page)).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { themeTransitions: { reveals: number } }).themeTransitions.reveals,
      ),
    )
    .toBe(1)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
})

for (const fallback of ['reduced motion', 'unsupported browser'] as const) {
  test(`theme changes still work with ${fallback}`, async ({ page }) => {
    await setup(page)
    if (fallback === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' })
    else
      await page.addInitScript(() => {
        Object.defineProperty(document, 'startViewTransition', {
          value: undefined,
          configurable: true,
        })
      })
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Color mode', exact: true }).click()
    await page.getByRole('option', { name: 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await transitions(page)).toBe(0)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('registry-ui-color-mode')))
      .toBe('dark')
  })
}

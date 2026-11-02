import { test, expect, type Page } from '@playwright/test'

const digestA = `sha256:${'a'.repeat(64)}`
const digestB = `sha256:${'b'.repeat(64)}`
const searchName = 'Search repositories or images…'
function image(tag: string, digest = digestA) {
  return { Tag: tag, Digest: digest, RepoName: 'demo/backend', Manifests: [], Size: '1024' }
}
async function setup(
  page: Page,
  options: {
    enabled?: boolean
    preflightFails?: boolean
    partialFailure?: boolean
    many?: boolean
    monitoring?: boolean
  } = {},
) {
  const deleted: string[] = []
  let images = options.many
    ? Array.from({ length: 14 }, (_, i) =>
        image(`v${String(i).padStart(2, '0')}`, i % 2 ? digestA : digestB),
      )
    : [image('latest'), image('v1'), image('other', digestB)]
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: {
        auth: false,
        user: '',
        deleteEnabled: options.enabled !== false,
        monitoringEnabled: options.monitoring || false,
      },
    }),
  )
  await page.route('**/api/registry/catalog', (route) =>
    route.fulfill({
      json: { repositories: ['alpine', 'demo/backend', 'demo/backend/nested', 'demo/frontend'] },
    }),
  )
  await page.route('**/api/registry/repository?*', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name')!
    return route.fulfill({
      json: { Summary: { Name: name, TagCount: images.length, Platforms: [] }, Images: images },
    })
  })
  await page.route('**/api/registry/image?*', (route) => {
    if (options.preflightFails)
      return route.fulfill({ status: 500, json: { statusMessage: 'Preflight failed' } })
    const reference = new URL(route.request().url()).searchParams.get('reference')!
    const value = images.find((item) => item.Tag === reference || item.Digest === reference)!
    return route.fulfill({
      json: {
        ...value,
        IsDeletable: options.enabled !== false,
        AffectedTags: [
          ...images.filter((item) => item.Digest === value.Digest).map((item) => item.Tag),
          'hidden-alias',
        ],
      },
    })
  })
  await page.route('**/api/registry/manifest?*', async (route) => {
    const digest = new URL(route.request().url()).searchParams.get('digest')!
    deleted.push(digest)
    if (options.partialFailure && digest === digestB)
      return route.fulfill({ status: 500, json: { statusMessage: 'Registry refused deletion' } })
    images = images.filter((item) => item.Digest !== digest)
    return route.fulfill({ json: { ok: true } })
  })
  return deleted
}

test.use({ locale: 'en-US' })

test('palette click, shortcuts, focus, navigation and registry search', async ({ page }) => {
  await setup(page)
  await page.goto('/explore')
  const trigger = page.getByRole('button', { name: searchName, exact: true })
  await expect(trigger).toContainText('K')
  await trigger.click()
  let dialog = page.getByRole('dialog')
  const input = page.getByRole('dialog').getByRole('textbox')
  await expect(input).toBeFocused()
  await expect(dialog.getByRole('option', { name: 'Overview', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  for (const shortcut of ['Meta+k', 'Control+k', '/']) {
    await page.keyboard.press(shortcut)
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
  await trigger.click()
  await input.fill('demo:lat')
  await expect(dialog.getByRole('option', { name: 'demo:latest', exact: true })).toBeVisible()
  await input.fill('backend')
  await expect(dialog.getByRole('option', { name: 'demo/backend', exact: true })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/image/)
  await expect(dialog).toBeHidden()
  await trigger.click()
  dialog = page.getByRole('dialog')
  await input.fill('Settings')
  await dialog.getByRole('option', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/settings/)
})

test('palette search errors, empty results and slash inside input', async ({ page }) => {
  await setup(page)
  await page.goto('/explore')
  const input = page.getByRole('textbox', { name: searchName })
  await input.fill('/')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: searchName }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('missing')
  await expect(dialog.getByRole('status')).toHaveText('No results found')
  await page.route('**/api/registry/catalog', (route) =>
    route.fulfill({ status: 500, json: { statusMessage: 'Search failed' } }),
  )
  await dialog.getByRole('textbox').fill('failure')
  await expect(dialog.getByRole('alert')).toContainText('Search failed')
})

test('explorer nested folders collapse and retain repository links', async ({ page }) => {
  await setup(page)
  await page.goto('/explore')
  await page.getByRole('button', { name: 'Collapse demo', exact: true }).click()
  await expect(page.getByRole('link', { name: 'backend', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Expand demo', exact: true }).click()
  await page.getByRole('button', { name: 'Collapse demo/backend', exact: true }).click()
  await expect(page.getByRole('link', { name: 'nested', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'backend', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Collapse demo', exact: true }).click()
  await page.getByRole('button', { name: 'Expand demo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Expand demo/backend', exact: true })).toBeVisible()
})

test('single delete confirms aliases, cancel sends nothing, bulk deduplicates digest', async ({
  page,
}) => {
  const deleted = await setup(page)
  await page.goto('/image/demo%2Fbackend')
  await page.getByRole('button', { name: 'Delete manifest latest', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('latest, v1, hidden-alias')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(deleted).toEqual([])
  await page.getByRole('checkbox', { name: 'Select latest', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Select v1', exact: true }).check()
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  await expect(dialog.getByText(digestA, { exact: true })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: 'latest', exact: true })).toHaveCount(0)
  expect(deleted).toEqual([digestA])
})

test('delete disabled has no selection or actions', async ({ page }) => {
  await setup(page, { enabled: false })
  await page.goto('/image/demo%2Fbackend')
  await expect(page.getByRole('link', { name: 'latest', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0)
})

test('failed preflight blocks deletion', async ({ page }) => {
  const deleted = await setup(page, { preflightFails: true })
  await page.goto('/image/demo%2Fbackend')
  await page.getByRole('button', { name: 'Delete manifest latest', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('Preflight failed')
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  expect(deleted).toEqual([])
})

test('partial deletion preserves per-digest errors and refreshes table', async ({ page }) => {
  const deleted = await setup(page, { partialFailure: true })
  await page.goto('/image/demo%2Fbackend')
  await page.getByRole('checkbox', { name: 'Select all visible tags' }).check()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Registry refused deletion')
  await expect(dialog.getByRole('alert')).toContainText(digestB)
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(page.getByRole('link', { name: 'latest', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'other', exact: true })).toBeVisible()
  expect(deleted).toEqual([digestA, digestB])
})

test('selection clears on filter, sort and page changes; select all is current page only', async ({
  page,
}) => {
  await setup(page, { many: true })
  await page.goto('/image/demo%2Fbackend')
  const all = page.getByRole('checkbox', { name: 'Select all visible tags' })
  await all.check()
  await expect(page.getByText('12 selected', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Tags', exact: true }).fill('v00')
  await expect(page.getByRole('button', { name: 'Delete selected' })).toHaveCount(0)
  await all.check()
  await page.getByRole('textbox', { name: 'Tags', exact: true }).clear()
  await all.check()
  await page.getByRole('combobox', { name: 'Sort' }).click()
  await page.getByRole('option', { name: 'Name A–Z' }).click()
  await expect(page.getByRole('button', { name: 'Delete selected' })).toHaveCount(0)
  await all.check()
  await page.getByRole('button', { name: 'Page 2', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete selected' })).toHaveCount(0)
  await all.check()
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
})

test('tag detail uses the same confirmation and redirects after deletion', async ({ page }) => {
  const deleted = await setup(page)
  await page.goto('/image/demo%2Fbackend/tag/latest')
  await page.getByRole('button', { name: 'Delete manifest', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('latest, v1, hidden-alias')
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(page).toHaveURL(/image\/demo%2Fbackend$/)
  expect(deleted).toEqual([digestA])
})

test('mobile palette opens once from trigger and from global shortcut', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Search and navigation', exact: true })
  await expect(palette).toHaveCount(1)
  await expect(palette.getByRole('textbox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  await page.getByRole('button', { name: 'Navigation', exact: true }).click()
  const sidebar = page.getByRole('dialog', { name: 'Open sidebar', exact: true })
  await sidebar.getByRole('button', { name: searchName }).click()
  await expect(palette).toHaveCount(1)
  await expect(palette.getByRole('textbox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sidebar.getByRole('button', { name: searchName })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

for (const [platform, modifier] of [
  ['MacIntel', '⌘'],
  ['Win32', 'Ctrl'],
]) {
  test(`shortcut display for ${platform}`, async ({ page }) => {
    await page.addInitScript(
      (value) => Object.defineProperty(navigator, 'platform', { value }),
      platform,
    )
    await setup(page)
    await page.goto('/explore')
    await expect(page.getByRole('button', { name: searchName })).toContainText(`${modifier}K`)
  })
}

test('slow search responses never replace newer results', async ({ page }) => {
  await setup(page, { monitoring: true })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const requested = new Promise<void>((resolve) => {
    started = resolve
  })
  await page.route('**/api/registry/repository?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('name') === 'slow') {
      started()
      await gate
    }
    await route.fulfill({ json: { Images: [image('latest')] } })
  })
  await page.goto('/settings')
  await page.getByRole('button', { name: searchName }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('option', { name: 'Overview', exact: true })).toBeVisible()
  await dialog.getByRole('textbox').fill('slow:lat')
  await requested
  await dialog.getByRole('textbox').fill('backend')
  await expect(dialog.getByRole('option', { name: 'demo/backend', exact: true })).toBeVisible()
  release()
  await expect(dialog.getByRole('option', { name: 'slow:latest', exact: true })).toHaveCount(0)
})

test('preflight loading and in-flight deletion prevent repeated submission or dismissal', async ({
  page,
}) => {
  const deleted = await setup(page)
  let releasePreflight!: () => void
  const preflightGate = new Promise<void>((resolve) => {
    releasePreflight = resolve
  })
  await page.route('**/api/registry/image?*', async (route) => {
    await preflightGate
    await route.fulfill({
      json: { ...image('latest'), IsDeletable: true, AffectedTags: ['latest', 'v1'] },
    })
  })
  let releaseDelete!: () => void
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })
  await page.route('**/api/registry/manifest?*', async (route) => {
    await deleteGate
    await route.fallback()
  })
  await page.goto('/image/demo%2Fbackend')
  await page.getByRole('button', { name: 'Delete manifest latest', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  releasePreflight()
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  releaseDelete()
  await expect(dialog).toBeHidden()
  expect(deleted).toEqual([digestA])
})

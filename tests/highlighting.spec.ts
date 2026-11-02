import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'en-US' })
async function expectWrapped(page: Page, selector: string) {
  const blocks = page.locator(selector)
  await expect(blocks.first()).toBeVisible()
  for (const block of await blocks.all()) {
    await expect(block).toHaveCSS('white-space', 'pre-wrap')
    expect(await block.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
}
test('registry highlights commands, Markdown and JSON safely', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({ json: { auth: false, user: '', deleteEnabled: false } }),
  )
  await page.route('**/api/registry/image?*', (route) =>
    route.fulfill({
      json: {
        Name: 'alpine',
        Tag: 'latest',
        Digest: 'sha256:' + 'a'.repeat(64),
        Description:
          '```json\n{"enabled": true, "digest": "sha256:' +
          'c'.repeat(200) +
          '"}\n```\n\n<script>alert(1)</script>\n\n```unknown\n<img src=x onerror=alert(1)>\n' +
          'fallback'.repeat(80) +
          '\n```',
        Manifests: [
          {
            Digest: 'sha256:' + 'a'.repeat(64),
            ConfigDigest: 'sha256:' + 'b'.repeat(64),
            Platform: { Os: 'linux', Arch: 'amd64' },
            History: [
              { HistoryDescription: { CreatedBy: '/bin/sh -c echo hello' }, Layer: { Size: 123 } },
            ],
          },
        ],
      },
    }),
  )
  await page.route('**/api/registry/document?*', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 2,
        value: '<script>alert(1)</script>',
        enabled: true,
        long: 'x'.repeat(2000),
      },
    }),
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/image/alpine/tag/latest')
  const commands = page.locator('.code-block').filter({ hasText: 'docker pull' })
  const token = commands.locator('span[style*="--shiki-light"]').first()
  await expect(token).toBeVisible()
  const light = await token.evaluate((element) => getComputedStyle(element).color)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect
    .poll(() => token.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(light)
  await page.getByRole('combobox').last().click()
  await page.getByRole('option', { name: 'skopeo', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('textbox', { name: 'Path', exact: true })
    .fill('./custom/' + 'nested'.repeat(35))
  const updated = page.locator('.code-block').filter({ hasText: 'skopeo copy' })
  await expect(updated).toContainText('oci:./custom/')
  await expectWrapped(page, '.code-block pre')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(await updated.locator('code').textContent())
  await page.getByRole('button', { name: 'Metadata', exact: true }).click()
  await expect(page.locator('.prose pre.shiki span').first()).toBeVisible()
  await expectWrapped(page, '.prose pre')
  await expect(page.locator('.prose script, .prose img')).toHaveCount(0)
  await expect(page.locator('.prose')).toContainText('<script>alert(1)</script>')
  await page.getByRole('button', { name: 'Manifest', exact: true }).click()
  await expect(
    page.locator('.code-block').filter({ hasText: 'schemaVersion' }).locator('span').first(),
  ).toBeVisible()
  for (const tab of ['Manifest', 'Configuration']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    const document = page.locator('.code-block').filter({ hasText: 'schemaVersion' })
    await expectWrapped(page, '.code-block pre')
    await document.locator('..').getByRole('button', { name: 'Copy', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(await document.locator('code').textContent())
    const key = document.locator('span').filter({ hasText: /^\s*"schemaVersion"$/ })
    await expect(key).toHaveCSS('color', 'rgb(224, 108, 117)')
    await expect(
      document.locator('span').filter({ hasText: /^"<script>alert\(1\)<\/script>"$/ }),
    ).toHaveCSS('color', 'rgb(152, 195, 121)')
    await expect(document.locator('span').filter({ hasText: /^2$/ })).toHaveCSS(
      'color',
      'rgb(209, 154, 102)',
    )
    await expect(document.locator('span').filter({ hasText: /^true$/ })).toHaveCSS(
      'color',
      'rgb(209, 154, 102)',
    )
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(key).toHaveCSS('color', 'rgb(0, 92, 197)')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(key).toHaveCSS('color', 'rgb(224, 108, 117)')
  }
  await page.getByRole('button', { name: 'Layers & history', exact: true }).click()
  await expectWrapped(page, '.code-block pre')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

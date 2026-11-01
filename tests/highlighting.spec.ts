import { expect, test } from '@playwright/test'

test.use({ locale: 'en-US' })
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
          '```json\n{"enabled": true}\n```\n\n<script>alert(1)</script>\n\n```unknown\n<img src=x onerror=alert(1)>\n```',
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
      json: { schemaVersion: 2, value: '<script>alert(1)</script>', long: 'x'.repeat(2000) },
    }),
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/image/alpine/tag/latest')
  const commands = page.locator('.code-block').filter({ hasText: 'docker pull' })
  const token = commands.locator('span[style*="--shiki-light"]').first()
  await expect(token).toBeVisible()
  const light = await token.evaluate((element) => getComputedStyle(element).color)
  await page.getByRole('button', { name: 'Dark', exact: true }).first().click()
  await expect
    .poll(() => token.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(light)
  await page.getByRole('combobox').last().click()
  await page.getByRole('option', { name: 'skopeo', exact: true }).click()
  await page.getByRole('textbox', { name: 'Path', exact: true }).fill('./custom')
  const updated = page.locator('.code-block').filter({ hasText: 'skopeo copy' })
  await expect(updated).toContainText('oci:./custom:latest')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(await updated.locator('code').textContent())
  await page.getByRole('button', { name: 'Metadata', exact: true }).click()
  await expect(page.locator('.prose pre.shiki span').first()).toBeVisible()
  await expect(page.locator('.prose script, .prose img')).toHaveCount(0)
  await expect(page.locator('.prose')).toContainText('<script>alert(1)</script>')
  await page.getByRole('button', { name: 'Manifest', exact: true }).click()
  await expect(
    page.locator('.code-block').filter({ hasText: 'schemaVersion' }).locator('span').first(),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

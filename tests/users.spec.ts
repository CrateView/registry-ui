import { test, expect } from '@playwright/test'

test.use({ locale: 'en-US' })
async function setup(
  page: import('@playwright/test').Page,
  allowed = true,
  tokenMode = false,
  withOtherUser = false,
) {
  let users: { username: string; grants?: { pattern: string; role: string }[] }[] = [
    { username: 'admin', ...(tokenMode ? { grants: [{ pattern: '*', role: 'manager' }] } : {}) },
  ]
  if (withOtherUser) users.push({ username: 'alice' })
  const submitted: unknown[] = []
  await page.route('**/api/registry/status', (route) =>
    route.fulfill({
      json: {
        auth: true,
        authType: tokenMode ? 'token' : 'basic',
        user: 'admin',
        userManagement: true,
        canCreateUsers: allowed,
        deleteEnabled: true,
      },
    }),
  )
  await page.route('**/api/account/users', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { users } })
      return
    }
    const input = route.request().postDataJSON()
    submitted.push(input)
    if (users.some((user) => user.username === input.username)) {
      await route.fulfill({ status: 409, json: { statusMessage: 'Username already exists' } })
      return
    }
    users = [...users, { username: input.username, ...(tokenMode ? { grants: [] } : {}) }]
    await route.fulfill({ json: { username: input.username } })
  })
  return submitted
}

test('administration groups settings and users; creation validates before submitting', async ({
  page,
}) => {
  const submitted = await setup(page)
  await page.goto('/users')
  const administration = page.getByRole('navigation', { name: 'Navigation', exact: true })
  await expect(administration.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
  await expect(administration.getByRole('link', { name: 'Users', exact: true })).toBeVisible()
  await expect(administration.getByRole('link')).toHaveText(['Explore', 'Users', 'Settings'])
  await expect(page.getByRole('cell', { name: /admin/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Repository access' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Create user', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Create user', exact: true }).click()
  await expect(dialog.getByText('This field is required.')).toHaveCount(3)
  expect(submitted).toHaveLength(0)
  await dialog.getByLabel('Username', { exact: true }).fill('../bad')
  await dialog.getByLabel('Password', { exact: true }).fill('short')
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('different')
  await dialog.getByRole('button', { name: 'Create user', exact: true }).click()
  await expect(dialog.getByText('Passwords do not match.')).toBeVisible()
  expect(submitted).toHaveLength(0)
  await dialog.getByLabel('Username', { exact: true }).fill('alice')
  await dialog.getByLabel('Password', { exact: true }).fill('valid-password-123')
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('valid-password-123')
  await dialog.getByRole('button', { name: 'Create user', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'alice', exact: true })).toBeVisible()
  expect(submitted).toEqual([{ username: 'alice', password: 'valid-password-123' }])
})

test('token mode displays grants; duplicate accounts remain actionable', async ({ page }) => {
  await setup(page, true, true)
  await page.goto('/users')
  await expect(page.getByRole('columnheader', { name: 'Repository access' })).toBeVisible()
  await expect(page.getByText('* · Read, push and delete')).toBeVisible()
  await page.getByRole('button', { name: 'Create user', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Username', { exact: true }).fill('admin')
  await dialog.getByLabel('Password', { exact: true }).fill('valid-password-123')
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('valid-password-123')
  await dialog.getByRole('button', { name: 'Create user', exact: true }).click()
  await expect(dialog.getByText(/Username already exists/)).toBeVisible()
  await expect(dialog.getByLabel('Username', { exact: true })).toHaveValue('admin')
})

test('unauthorized users cannot see administration controls on direct navigation', async ({
  page,
}) => {
  await setup(page, false)
  await page.goto('/users')
  await expect(page.getByText('You are not allowed to administer users.')).toBeVisible()
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation', exact: true })
      .getByRole('link', { name: 'Users', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create user', exact: true })).toHaveCount(0)
})

test('password changes use schema validation and matching confirmation', async ({ page }) => {
  await setup(page)
  let submitted = false
  await page.route('**/api/account/password', async (route) => {
    submitted = true
    await route.fulfill({ json: { ok: true } })
  })
  await page.goto('/account')
  await page.getByLabel('Current password', { exact: true }).fill('admin')
  await page.getByLabel('New password', { exact: true }).fill('short')
  await page.getByLabel('Confirm new password', { exact: true }).fill('different')
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByText('Passwords do not match.')).toBeVisible()
  expect(submitted).toBe(false)
})

for (const tokenMode of [false, true]) {
  test(`admin resets another password and confirms deletion (${tokenMode ? 'token' : 'basic'})`, async ({
    page,
  }) => {
    await setup(page, true, tokenMode, true)
    const passwords: unknown[] = []
    const deletions: unknown[] = []
    await page.route('**/api/account/users/password', async (route) => {
      passwords.push(route.request().postDataJSON())
      await route.fulfill({ json: { ok: true } })
    })
    await page.route('**/api/account/users/delete', async (route) => {
      deletions.push(route.request().postDataJSON())
      if (deletions.length === 1) {
        await route.fulfill({ status: 503, json: { statusMessage: 'Account service unavailable' } })
        return
      }
      await page.route('**/api/account/users', (list) =>
        list.fulfill({ json: { users: [{ username: 'admin' }] } }),
      )
      await route.fulfill({ json: { ok: true } })
    })
    await page.goto('/users')
    const admin = page.getByRole('row').filter({ has: page.getByRole('cell', { name: /admin/ }) })
    await admin.getByRole('button', { name: 'Actions', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete user', exact: true })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Change password', exact: true }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByLabel('Current password', { exact: true })).toBeVisible()
    await page.goto('/users')
    const alice = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'alice', exact: true }) })
    await alice.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Change password', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Username', { exact: true })).toBeDisabled()
    await expect(dialog.getByLabel('Username', { exact: true })).toHaveValue('alice')
    await dialog.getByLabel('Password', { exact: true }).fill('replacement-password')
    await dialog.getByLabel('Confirm new password', { exact: true }).fill('mismatch')
    await dialog.getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(dialog.getByText('Passwords do not match.')).toBeVisible()
    expect(passwords).toEqual([])
    await dialog.getByLabel('Confirm new password', { exact: true }).fill('replacement-password')
    await dialog.getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(passwords).toEqual([{ username: 'alice', password: 'replacement-password' }])
    await alice.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delete user', exact: true }).click()
    await expect(dialog).toContainText('Delete user alice?')
    expect(deletions).toEqual([])
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(deletions).toEqual([])
    await alice.getByRole('button', { name: 'Actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delete user', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete user', exact: true }).click()
    await expect(dialog.getByText(/Account service unavailable/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete user', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(alice).toHaveCount(0)
    expect(deletions).toEqual([{ username: 'alice' }, { username: 'alice' }])
  })
}

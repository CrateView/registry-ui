import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Store, actionsFor } from '../src/store.mjs'
import { scopedAccess } from '../src/token.mjs'
import { authServer } from '../src/server.mjs'

const password = 'test-password-123'
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'crateview-accounts-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return new Store(directory)
}
test('concurrent creates preserve accounts; password changes verify current credentials', async (t) => {
  const store = await fixture(t)
  await Promise.all(
    ['alice', 'bob', 'carol'].map((user) => store.setPassword(user, password, { create: true })),
  )
  assert.equal((await store.accounts()).entries.size, 3)
  await assert.rejects(store.setPassword('alice', password, { create: true }), { status: 409 })
  await assert.rejects(
    store.setPassword('alice', 'replacement-password', { currentPassword: 'wrong' }),
    { status: 401 },
  )
  await store.setPassword('alice', 'replacement-password', { currentPassword: password })
  await assert.rejects(store.authenticate('alice', password), { status: 401 })
  await store.authenticate('alice', 'replacement-password')
  await store.authenticate('bob', password)
  assert.ok(!(await readFile(join(store.directory, 'htpasswd'), 'utf8')).includes(password))
})
test('deleting and recreating a name never revives old rights; malformed files fail closed', async (t) => {
  const store = await fixture(t)
  await store.setPassword('alice', password, { create: true })
  await store.grant('alice', 'team/*', 'writer')
  await store.remove('alice')
  await store.setPassword('alice', password, { create: true })
  assert.deepEqual(await store.grants('alice'), [])
  await writeFile(join(store.directory, 'permissions.json'), '{broken')
  await assert.rejects(store.grants('alice'))
  await assert.rejects(store.setPassword('bob', password, { create: true }))
  assert.equal((await store.accounts()).entries.size, 1)
})
test('scope intersection, namespace boundaries, and catalog never elevate user rights', () => {
  const grants = [
    { pattern: 'team/*', role: 'writer' },
    { pattern: 'team/one', role: 'manager' },
  ]
  assert.deepEqual(actionsFor(grants, 'team/one'), ['pull', 'push', 'delete'])
  assert.deepEqual(actionsFor(grants, 'team-other/one'), [])
  assert.deepEqual(actionsFor(grants, 'team'), [])
  assert.deepEqual(
    scopedAccess(
      [
        'repository:team/two:pull,push,delete',
        'registry:catalog:*',
        'repository:secret/image:pull',
      ],
      grants,
    ),
    [
      { type: 'repository', name: 'team/two', actions: ['pull', 'push'] },
      { type: 'repository', name: 'secret/image', actions: [] },
    ],
  )
  assert.deepEqual(scopedAccess(['repository:team/one:pull,push'], []), [
    { type: 'repository', name: 'team/one', actions: [] },
  ])
})
test('in-flight authentication rejects a concurrently replaced account generation', async (t) => {
  const store = await fixture(t)
  await store.setPassword('alice', password, { create: true })
  await store.grant('alice', 'team/*', 'reader')
  let release, reached
  const paused = new Promise((resolve) => {
    release = resolve
  })
  const readingGrants = new Promise((resolve) => {
    reached = resolve
  })
  const grants = store.grants.bind(store)
  store.grants = async (username) => {
    const result = await grants(username)
    reached()
    await paused
    return result
  }
  const inFlight = store.identity('alice', password, true)
  const rejected = assert.rejects(inFlight, { status: 401 })
  const writer = new Store(store.directory)
  await readingGrants
  await writer.remove('alice')
  await writer.setPassword('alice', 'replacement-password', { create: true })
  await writer.grant('alice', '*', 'manager')
  release()
  await rejected
  await writer.authenticate('alice', 'replacement-password')
})
test('CLI bootstraps, grants, resets and deletes accounts without a running UI or auth server', async (t) => {
  const store = await fixture(t)
  const cli = (args, input) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), ...args],
        {
          env: { ...process.env, AUTH_DATA_DIR: store.directory },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let output = ''
      child.stdout.on('data', (data) => {
        output += data
      })
      child.stderr.on('data', (data) => {
        output += data
      })
      child.once('error', reject)
      child.once('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(output))))
      child.stdin.end(input)
    })
  await cli(['add', 'constructor'], password)
  assert.deepEqual(await store.grants('constructor'), [])
  await cli(['grant', 'constructor', 'team/*', 'writer'])
  const list = JSON.parse(await cli(['list']))
  assert.deepEqual(list, [
    { username: 'constructor', grants: [{ pattern: 'team/*', role: 'writer' }] },
  ])
  await cli(['passwd', 'constructor'], 'changed-cli-password')
  await store.authenticate('constructor', 'changed-cli-password')
  await cli(['delete', 'constructor'])
  assert.equal((await store.accounts()).entries.size, 0)
})
test('validation rejects unsafe usernames, weak and bcrypt-truncated passwords', async (t) => {
  const store = await fixture(t)
  for (const username of ['../evil', 'alice:other', '', 'x\ny'])
    await assert.rejects(store.setPassword(username, password, { create: true }), { status: 400 })
  for (const value of ['short', 'é'.repeat(37), 'x'.repeat(73)])
    await assert.rejects(store.setPassword('alice', value, { create: true }), { status: 400 })
  await store.setPassword('alice', password, { create: true })
  await assert.rejects(store.authenticate('missing', password), { status: 401 })
  await assert.rejects(store.authenticate('alice', password + 'x'.repeat(100)), { status: 401 })
})
test('management requires service secret and valid actor; basic mode has no token endpoint', async (t) => {
  const store = await fixture(t)
  await store.setPassword('alice', password, { create: true })
  const secret = 'test-service-secret-with-at-least-32-characters'
  const server = await authServer({
    mode: 'htpasswd',
    directory: store.directory,
    managementSecret: secret,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      }),
  )
  const base = `http://127.0.0.1:${server.address().port}`
  const authorization = `Basic ${Buffer.from(`alice:${password}`).toString('base64')}`
  const post = (path, input, key = secret) =>
    fetch(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  assert.equal(
    (await post('/internal/users', { authorization, username: 'bob', password }, 'wrong')).status,
    401,
  )
  assert.equal(
    (
      await post('/internal/users', {
        authorization: 'Basic YmFkOmJhZA==',
        username: 'bob',
        password,
      })
    ).status,
    401,
  )
  assert.equal(
    (await post('/internal/users', { authorization, username: 'bob', password })).status,
    200,
  )
  assert.equal(
    (
      await post('/internal/password', {
        authorization,
        currentPassword: 'wrong',
        password: 'replacement-pass',
      })
    ).status,
    401,
  )
  assert.equal((await fetch(base + '/token')).status, 404)
  const login = await (await post('/internal/login', { authorization })).json()
  assert.equal(login.mode, 'htpasswd')
})

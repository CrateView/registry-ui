import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAccountService } from '../src/accounts.mjs';
import { Store } from '../src/store.mjs';

const password = 'test-password-123';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'crateview-integrated-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(directory);
  await store.setPassword('admin', password, { create: true });
  const service = await createAccountService({ mode: 'htpasswd', directory });
  const authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
  const request = (path, body = {}) => service.request('/internal/' + path, { authorization, ...body });
  return { directory, store, service, request };
}

test('direct operations retain account response contracts, password rules and self-protection', async (t) => {
  const { store, request } = await fixture(t);
  assert.deepEqual(await request('login'), { username: 'admin', mode: 'htpasswd', globalRead: false });
  assert.deepEqual(await request('users', { username: 'alice', password }), { username: 'alice' });
  await assert.rejects(request('users', { username: 'alice', password }), { status: 409 });
  assert.deepEqual(await request('users/list'), { users: [{ username: 'admin' }, { username: 'alice' }] });
  await assert.rejects(request('users/password', { username: 'admin', password }), { status: 403 });
  await assert.rejects(request('users/delete', { username: 'admin' }), { status: 403 });
  await assert.rejects(request('password', { currentPassword: 'wrong', password }), { status: 401 });
  await assert.rejects(request('users', { username: 'weak', password: 'short' }), { status: 400 });
  assert.deepEqual(await request('users/password', { username: 'alice', password: 'replacement-password' }), {
    ok: true,
  });
  await assert.rejects(store.authenticate('alice', password), { status: 401 });
  await store.authenticate('alice', 'replacement-password');
  assert.deepEqual(await request('users/delete', { username: 'alice' }), { ok: true });
  await assert.rejects(request('users/delete', { username: 'alice' }), { status: 404 });
  await assert.rejects(request('token', {}), { status: 404 });
});

test('failed-login window applies to direct requests without blocking other clients', async (t) => {
  const { service, request } = await fixture(t);
  for (let i = 0; i < 30; i++)
    await assert.rejects(
      service.limit('client-a', () => request('login', { authorization: 'invalid' })),
      { status: 401 },
    );
  await assert.rejects(
    service.limit('client-a', () => request('login')),
    { status: 429 },
  );
  assert.equal((await service.limit('client-b', () => request('login'))).username, 'admin');
});

test('corrupt storage is never overwritten by direct management', async (t) => {
  const { directory, request } = await fixture(t);
  const htpasswd = await readFile(join(directory, 'htpasswd'), 'utf8');
  await writeFile(join(directory, 'permissions.json'), '{broken');
  await assert.rejects(request('users', { username: 'alice', password }));
  await assert.rejects(request('users/delete', { username: 'admin' }));
  assert.equal(await readFile(join(directory, 'htpasswd'), 'utf8'), htpasswd);
  await writeFile(join(directory, 'permissions.json'), '{"version":1,"users":{}}');
  await writeFile(join(directory, 'htpasswd'), 'malformed');
  await assert.rejects(request('users', { username: 'alice', password }));
  assert.equal(await readFile(join(directory, 'htpasswd'), 'utf8'), 'malformed');
});

test('unwritable storage rejects changes and preserves existing hashes', async (t) => {
  if (process.getuid?.() === 0) return t.skip('Permission checks require an unprivileged runtime');
  const { directory, request } = await fixture(t);
  const before = await readFile(join(directory, 'htpasswd'), 'utf8');
  await chmod(directory, 0o500);
  try {
    await assert.rejects(request('users', { username: 'alice', password }), { code: 'EACCES' });
    assert.equal(await readFile(join(directory, 'htpasswd'), 'utf8'), before);
  } finally {
    await chmod(directory, 0o700);
  }
});

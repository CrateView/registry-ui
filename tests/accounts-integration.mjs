import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { join, resolve } from 'node:path';
import { authServer } from '../auth/src/server.mjs';
import { Store } from '../auth/src/store.mjs';

// Every container and volume here is isolated; no existing registry is modified.
await mkdir('.dev', { recursive: true });
const root = await mkdtemp(resolve('.dev/accounts-integration-'));
const secret = 'test-only-management-secret-at-least-32-characters';
const password = 'test-password-123';
const basic = (user, pass = password) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const containers = [];
const servers = [];
const children = [];
let browser;
const media = 'application/vnd.oci.image.manifest.v1+json';
const digest = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
async function dockerClient(args, config, input) {
  return new Promise((resolve, reject) => {
    const hostMapping = process.platform === 'darwin' ? [] : ['--add-host', 'host.docker.internal:host-gateway'];
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        ...hostMapping,
        '-v',
        `${config}:/fixture`,
        '-e',
        'DOCKER_HOST=unix:///unavailable.sock',
        '-e',
        'SSL_CERT_FILE=/fixture/client.crt',
        '-e',
        'PATH=/fixture:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'docker:29-cli',
        '--config',
        '/fixture',
        ...args,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(output))));
    child.stdin.end(input);
  });
}
async function wait(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* Wait for startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Startup timed out: ${url}`);
}
async function startUi(upstream, mode, authUrl, realm, allowed) {
  const { createServer } = await import('node:net');
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      NUXT_REGISTRY_UPSTREAM: upstream,
      NUXT_SESSION_PASSWORD: 'test-only-session-secret-with-32-characters',
      NUXT_AUTH_MODE: mode,
      NUXT_AUTH_SERVICE_URL: authUrl,
      NUXT_AUTH_SERVICE_SECRET: secret,
      NUXT_AUTH_TOKEN_REALM: realm,
      NUXT_USER_CREATION_ALLOWED_USERS: allowed,
      NUXT_REGISTRY_DELETE_ENABLED: 'true',
      NUXT_MONITORING_ENABLED: 'false',
    },
  });
  let log = '';
  child.stdout.on('data', (data) => {
    log += data;
  });
  child.stderr.on('data', (data) => {
    log += data;
  });
  children.push(child);
  const url = `http://127.0.0.1:${port}`;
  try {
    await wait(url + '/api/registry/status');
  } catch (error) {
    throw new Error(`${error.message}\n${log}`, { cause: error });
  }
  return { url, child };
}
async function login(ui, user = 'admin') {
  const r = await fetch(ui + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ui },
    body: JSON.stringify({ username: user, password }),
  });
  assert.equal(r.status, 200, await r.text());
  return r.headers.get('set-cookie').split(';')[0];
}
async function post(ui, cookie, path, input, origin = ui) {
  return fetch(ui + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin },
    body: JSON.stringify(input),
  });
}
try {
  if (process.argv.includes('--browser')) {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  }
  for (const mode of ['htpasswd', 'token']) {
    const directory = join(root, mode);
    const store = new Store(directory);
    await store.setPassword('admin', password, { create: true });
    await store.setPassword('reader', password, { create: true });
    const keyPath = join(root, 'auth.key'),
      certificatePath = join(root, 'auth.crt');
    if (mode === 'token') {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          keyPath,
          '-out',
          certificatePath,
          '-days',
          '1',
          '-subj',
          '/CN=crateview-integration',
        ],
        { stdio: 'ignore' },
      );
      await store.grant('admin', '*', 'manager');
      await store.grant('reader', 'team/*', 'reader');
    }
    const server = await authServer({
      mode,
      directory,
      managementSecret: secret,
      issuer: 'crateview-test',
      service: 'crateview-test-registry',
      keyPath,
      certificatePath,
    });
    await new Promise((resolve) =>
      server.listen(0, process.argv.includes('--docker') ? '0.0.0.0' : '127.0.0.1', resolve),
    );
    servers.push(server);
    const authUrl = `http://127.0.0.1:${server.address().port}`;
    const realm = process.argv.includes('--docker')
      ? `http://host.docker.internal:${server.address().port}/token`
      : authUrl + '/token';
    const name = `crateview-accounts-${mode}-${process.pid}`;
    const config = `version: 0.1
log:
  level: error
storage:
  filesystem:
    rootdirectory: /var/lib/registry
  delete:
    enabled: true
http:
  addr: :5000
auth:
${mode === 'htpasswd' ? '  htpasswd:\n    realm: Registry\n    path: /auth/htpasswd' : `  token:\n    realm: ${realm}\n    service: crateview-test-registry\n    issuer: crateview-test\n    rootcertbundle: /fixture/auth.crt`}
`;
    const configPath = join(directory, 'config.yml');
    await writeFile(configPath, config);
    docker([
      'run',
      '-d',
      '--rm',
      '--name',
      name,
      '-p',
      '127.0.0.1::5000',
      '--tmpfs',
      '/var/lib/registry',
      '-e',
      'OTEL_TRACES_EXPORTER=none',
      '-v',
      `${directory}:/auth:ro`,
      '-v',
      `${root}:/fixture:ro`,
      'registry:3.1.2',
      '/auth/config.yml',
    ]);
    containers.push(name);
    const port = docker(['port', name, '5000/tcp']).split(':').at(-1);
    const registry = `http://127.0.0.1:${port}`;
    await wait(registry + '/v2/');
    async function token(user, scope) {
      if (mode === 'htpasswd') return basic(user);
      const params = new URLSearchParams({ service: 'crateview-test-registry', scope });
      const r = await fetch(`${authUrl}/token?${params}`, {
        headers: { Authorization: basic(user) },
      });
      assert.equal(r.status, 200, await r.clone().text());
      return 'Bearer ' + (await r.json()).token;
    }
    async function headers(user, repo, actions) {
      return { Authorization: await token(user, `repository:${repo}:${actions}`) };
    }
    for (const repo of ['team/app', 'secret/app']) {
      const h = await headers('admin', repo, 'pull,push');
      const config = JSON.stringify({
        architecture: 'amd64',
        os: 'linux',
        rootfs: { type: 'layers', diff_ids: [] },
        config: {},
      });
      const upload = await fetch(registry + `/v2/${repo}/blobs/uploads/`, {
        method: 'POST',
        headers: h,
      });
      assert.equal(upload.status, 202, await upload.clone().text());
      const location = new URL(upload.headers.get('location'), registry);
      location.searchParams.set('digest', digest(config));
      assert.equal(
        (
          await fetch(location, {
            method: 'PUT',
            headers: { ...h, 'Content-Type': 'application/octet-stream' },
            body: config,
          })
        ).status,
        201,
      );
      const manifest = JSON.stringify({
        schemaVersion: 2,
        mediaType: media,
        config: {
          mediaType: 'application/vnd.oci.image.config.v1+json',
          digest: digest(config),
          size: Buffer.byteLength(config),
        },
        layers: [],
      });
      const pushed = await fetch(registry + `/v2/${repo}/manifests/latest`, {
        method: 'PUT',
        headers: { ...h, 'Content-Type': media },
        body: manifest,
      });
      assert.equal(pushed.status, 201, await pushed.text());
    }
    const readHeaders = await headers('reader', 'team/app', 'pull,push,delete');
    const readable = await fetch(registry + '/v2/team/app/manifests/latest', {
      headers: { ...readHeaders, Accept: media },
    });
    assert.equal(readable.status, 200, await readable.clone().text());
    const imageDigest = readable.headers.get('docker-content-digest');
    if (process.argv.includes('--docker')) {
      const config = join(directory, 'docker-client');
      await mkdir(config);
      // Isolate credentials from native keychains, including Docker Desktop's default helper.
      await writeFile(join(config, 'config.json'), JSON.stringify({ credsStore: 'crateview-test' }));
      await writeFile(
        join(config, 'docker-credential-crateview-test'),
        `#!/bin/sh
case "$1" in
  store) cat >/fixture/credentials.json ;;
  get) cat /fixture/credentials.json ;;
  erase) rm -f /fixture/credentials.json ;;
esac
`,
        { mode: 0o700 },
      );
      const tlsKey = join(config, 'client.key'),
        tlsCert = join(config, 'client.crt');
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          tlsKey,
          '-out',
          tlsCert,
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-addext',
          'subjectAltName=IP:127.0.0.1,DNS:host.docker.internal',
        ],
        { stdio: 'ignore' },
      );
      // Linux CLI container trusts only this fixture certificate; no host trust or daemon changes.
      const tlsProxy = createHttpsServer(
        { key: readFileSync(tlsKey), cert: readFileSync(tlsCert) },
        async (request, response) => {
          const upstream = await fetch(registry + request.url, { headers: request.headers });
          response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
          response.end(Buffer.from(await upstream.arrayBuffer()));
        },
      );
      await new Promise((resolve) => tlsProxy.listen(0, '0.0.0.0', resolve));
      servers.push(tlsProxy);
      await dockerClient(
        ['login', `host.docker.internal:${tlsProxy.address().port}`, '--username', 'reader', '--password-stdin'],
        config,
        password,
      );
      console.log(`${mode}: real docker login passed`);
    }
    if (mode === 'token') {
      assert.equal(
        (
          await fetch(registry + '/v2/secret/app/manifests/latest', {
            headers: await headers('reader', 'secret/app', 'pull'),
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(registry + `/v2/team/app/manifests/${imageDigest}`, {
            method: 'DELETE',
            headers: readHeaders,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(registry + '/v2/team/app/blobs/uploads/', {
            method: 'POST',
            headers: readHeaders,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(registry + '/v2/_catalog', {
            headers: { Authorization: await token('admin', 'registry:catalog:*') },
          })
        ).status,
        401,
      );
      const valid = (await token('admin', 'repository:team/app:pull')).slice(7);
      const [head, payload] = valid.split('.');
      const data = JSON.parse(Buffer.from(payload, 'base64url'));
      data.exp = data.iat - 100;
      const input = `${head}.${Buffer.from(JSON.stringify(data)).toString('base64url')}`;
      const expired = input + '.' + sign('RSA-SHA256', Buffer.from(input), readFileSync(keyPath)).toString('base64url');
      assert.equal(
        (
          await fetch(registry + '/v2/team/app/manifests/latest', {
            headers: { Authorization: 'Bearer ' + expired },
          })
        ).status,
        401,
      );
    }
    const ui = await startUi(registry, mode, authUrl, realm, 'admin');
    if (browser) {
      const { expect } = await import('@playwright/test');
      const context = await browser.newContext({ locale: 'en-US' });
      try {
        const page = await context.newPage();
        await page.goto(ui.url + '/login');
        await page.getByLabel('Username', { exact: true }).fill('admin');
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page).toHaveURL(/\/explore$/);
        await page.goto(ui.url + '/users');
        await page.getByRole('button', { name: 'Create user', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Username', { exact: true }).fill('browseruser');
        await dialog.getByLabel('Password', { exact: true }).fill(password);
        await dialog.getByLabel('Confirm new password', { exact: true }).fill(password);
        await dialog.getByRole('button', { name: 'Create user', exact: true }).click();
        await expect(page.getByText('User created.', { exact: true })).toBeVisible();
        await page.screenshot({ path: `.dev/accounts-${mode}.png`, fullPage: true });
        await context.clearCookies();
        await page.goto(ui.url + '/login');
        await page.getByLabel('Username', { exact: true }).fill('browseruser');
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page).toHaveURL(/\/explore$/);
        await page.goto(ui.url + '/account');
        await expect(page.getByRole('button', { name: 'Create user', exact: true })).toHaveCount(0);
        await page.getByLabel('Current password', { exact: true }).fill(password);
        await page.getByLabel('New password', { exact: true }).fill('browser-new-password');
        await page.getByLabel('Confirm new password', { exact: true }).fill('browser-new-password');
        await page.getByRole('button', { name: 'Change password', exact: true }).click();
        await expect(page).toHaveURL(/\/login$/);
        await store.authenticate('browseruser', 'browser-new-password');
        console.log(`${mode}: browser account creation and own password change passed`);
      } finally {
        await context.close();
      }
    }
    const cookie = await login(ui.url);
    const readerCookie = await login(ui.url, 'reader');
    const userList = await fetch(ui.url + '/api/account/users', { headers: { Cookie: cookie } });
    assert.equal(userList.status, 200, await userList.clone().text());
    const listed = await userList.json();
    assert.ok(listed.users.some((user) => user.username === 'admin'));
    assert.ok(
      listed.users.every((user) =>
        Object.keys(user).every((key) => key === 'username' || (mode === 'token' && key === 'grants')),
      ),
    );
    assert.equal((await fetch(ui.url + '/api/account/users', { headers: { Cookie: readerCookie } })).status, 403);
    assert.equal(
      (
        await post(ui.url, cookie, '/api/account/users', {
          username: 'weak-password',
          password: 'short',
        })
      ).status,
      400,
    );
    assert.equal((await post(ui.url, cookie, '/api/account/users', { username: '../invalid', password })).status, 400);

    const status = await (await fetch(ui.url + '/api/registry/status', { headers: { Cookie: readerCookie } })).json();
    assert.equal(status.userManagement, true);
    assert.equal(status.canCreateUsers, false);
    assert.equal(status.authType, mode === 'token' ? 'token' : 'none');
    const catalog = await fetch(ui.url + '/api/registry/catalog', {
      headers: { Cookie: readerCookie },
    });
    assert.equal(catalog.status, 200, await catalog.clone().text());
    assert.deepEqual(
      (await catalog.json()).repositories.sort(),
      mode === 'token' ? ['team/app'] : ['secret/app', 'team/app'],
    );
    const readableImage = await fetch(ui.url + '/api/registry/image?name=team/app&reference=latest', {
      headers: { Cookie: readerCookie },
    });
    assert.equal(readableImage.status, 200, await readableImage.clone().text());
    assert.equal((await readableImage.json()).IsDeletable, mode === 'htpasswd');
    assert.equal(
      (await post(ui.url, readerCookie, '/api/account/users', { username: 'intruder', password })).status,
      403,
    );
    assert.equal(
      (await post(ui.url, cookie, '/api/account/users', { username: 'cross', password }, 'https://other.invalid'))
        .status,
      403,
    );
    assert.equal(
      (
        await post(ui.url, cookie, '/api/account/users', {
          username: 'escalate',
          password,
          role: 'manager',
        })
      ).status,
      400,
    );
    const created = await post(ui.url, cookie, '/api/account/users', {
      username: 'newuser',
      password,
    });
    assert.equal(created.status, 200, await created.text());
    assert.equal((await post(ui.url, cookie, '/api/account/users', { username: 'newuser', password })).status, 409);
    assert.deepEqual(await store.grants('newuser'), []);
    const newCookie = await login(ui.url, 'newuser');
    if (mode === 'token') {
      assert.deepEqual(
        (await (await fetch(ui.url + '/api/registry/catalog', { headers: { Cookie: newCookie } })).json()).repositories,
        [],
      );
      const image = await fetch(ui.url + '/api/registry/image?name=secret/app&reference=latest', {
        headers: { Cookie: readerCookie },
      });
      assert.equal(image.status, 403);
      const stillSignedIn = await (
        await fetch(ui.url + '/api/registry/status', { headers: { Cookie: readerCookie } })
      ).json();
      assert.equal(stillSignedIn.user, 'reader');
    }
    const changed = await post(ui.url, newCookie, '/api/account/password', {
      currentPassword: password,
      password: 'new-password-456',
    });
    assert.equal(changed.status, 200, await changed.text());
    await assert.rejects(store.authenticate('newuser', password), { status: 401 });
    await store.authenticate('newuser', 'new-password-456');
    assert.equal((await fetch(ui.url + '/api/registry/catalog', { headers: { Cookie: newCookie } })).status, 401);
    for (const action of ['password', 'delete']) {
      const path = '/api/account/users/' + action;
      const body = {
        username: 'reader',
        ...(action === 'password' ? { password: 'admin-reset-password' } : {}),
      };
      assert.equal((await post(ui.url, readerCookie, path, body)).status, 403);
      assert.equal((await post(ui.url, cookie, path, body, 'https://other.invalid')).status, 403);
      assert.equal((await post(ui.url, cookie, path, { ...body, username: 'admin' })).status, 403);
      assert.equal((await post(ui.url, cookie, path, { ...body, username: '../invalid' })).status, 400);
    }
    assert.equal(
      (
        await post(ui.url, cookie, '/api/account/users/password', {
          username: 'reader',
          password: 'short',
        })
      ).status,
      400,
    );
    const readerGrants = await store.grants('reader');
    assert.equal(
      (
        await post(ui.url, cookie, '/api/account/users/password', {
          username: 'reader',
          password: 'admin-reset-password',
        })
      ).status,
      200,
    );
    await assert.rejects(store.authenticate('reader', password), { status: 401 });
    await store.authenticate('reader', 'admin-reset-password');
    assert.deepEqual(await store.grants('reader'), readerGrants);
    assert.equal((await fetch(ui.url + '/api/registry/catalog', { headers: { Cookie: readerCookie } })).status, 401);
    // Restore the reader for the remaining direct registry checks.
    await store.setPassword('reader', password);
    await store.grant('newuser', 'team/*', 'writer');
    assert.equal((await post(ui.url, cookie, '/api/account/users/delete', { username: 'newuser' })).status, 200);
    await assert.rejects(store.authenticate('newuser', 'new-password-456'), { status: 401 });
    assert.deepEqual(await store.grants('newuser'), []);
    assert.equal((await post(ui.url, cookie, '/api/account/users/delete', { username: 'newuser' })).status, 404);
    const disabled = await startUi(registry, mode, authUrl, realm, '');
    const disabledCookie = await login(disabled.url);
    assert.equal(
      (
        await post(disabled.url, disabledCookie, '/api/account/users', {
          username: 'disabled',
          password,
        })
      ).status,
      403,
    );
    await Promise.all(
      [disabled.child, ui.child].map(
        (child) =>
          new Promise((resolve) => {
            child.once('exit', resolve);
            child.kill('SIGTERM');
          }),
      ),
    );
    // No UI process participates in these direct registry operations.
    assert.equal(
      (
        await fetch(registry + '/v2/team/app/manifests/latest', {
          headers: { ...(await headers('reader', 'team/app', 'pull')), Accept: media },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(registry + `/v2/secret/app/manifests/${imageDigest}`, {
          method: 'DELETE',
          headers: await headers(mode === 'token' ? 'admin' : 'reader', 'secret/app', 'delete'),
        })
      ).status,
      202,
    );
    console.log(
      `${mode}: Distribution push/pull, account changes, UI policy, catalog and UI-independent access passed`,
    );
  }
} finally {
  if (browser) await browser.close();
  for (const child of children) child.kill('SIGTERM');
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  for (const name of containers) {
    try {
      docker(['stop', '--time', '1', name]);
    } catch {
      /* Already stopped. */
    }
  }
  await rm(root, { recursive: true, force: true });
}

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'crateview-branding-integration-'));
const children = [];
let browser;
const light =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>';
const dark = light.replace('red', 'blue');
const lightFile = join(root, 'private-light.svg');
const darkFile = join(root, 'private-dark.svg');
const iconFile = join(root, 'private-icon.ico');
const icon = await readFile(new URL('../public/favicon.ico', import.meta.url));

async function start(overrides = {}) {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
      NUXT_APP_BASE_URL: '/',
      NUXT_MONITORING_ENABLED: 'false',
      NUXT_AUTH_MODE: 'off',
      NUXT_BRAND_LOGO_LIGHT_FILE: '',
      NUXT_BRAND_LOGO_DARK_FILE: '',
      NUXT_BRAND_FAVICON_FILE: '',
      NUXT_PUBLIC_BRAND_LOGO_LIGHT: 'https://example.test/light.svg',
      NUXT_PUBLIC_BRAND_LOGO_DARK: '/url-dark.svg',
      NUXT_PUBLIC_BRAND_FAVICON: '/url-icon.ico',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const closed = once(child, 'close');
  children.push({ child, closed });
  const origin = `http://127.0.0.1:${port}`;
  const url = origin + (overrides.NUXT_APP_BASE_URL || '/').replace(/\/$/, '');
  return { child, closed, origin, url, output: () => output };
}
async function ready(server) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.child.exitCode !== null) throw new Error(server.output());
    try {
      const response = await fetch(`${server.url}/api/branding`);
      if (response.ok) return response.json();
    } catch {
      /* Wait for the production server. */
    }
    await delay(100);
  }
  throw new Error(`Server did not become ready: ${server.output()}`);
}

try {
  await Promise.all([writeFile(lightFile, light), writeFile(darkFile, dark), writeFile(iconFile, icon)]);
  const defaults = await start();
  assert.deepEqual(await ready(defaults), {
    logoLight: 'https://example.test/light.svg',
    logoDark: '/url-dark.svg',
    favicon: '/url-icon.ico',
  });
  assert.equal((await fetch(`${defaults.url}/api/branding/logo-light`)).status, 404);
  defaults.child.kill();
  await defaults.closed;

  for (const baseURL of ['/', '/registry/']) {
    const server = await start({
      NUXT_APP_BASE_URL: baseURL,
      NUXT_BRAND_LOGO_LIGHT_FILE: lightFile,
      NUXT_BRAND_LOGO_DARK_FILE: relative(process.cwd(), darkFile),
      NUXT_BRAND_FAVICON_FILE: iconFile,
    });
    const links = await ready(server);
    assert.deepEqual(links, {
      logoLight: `${baseURL}api/branding/logo-light`,
      logoDark: `${baseURL}api/branding/logo-dark`,
      favicon: `${baseURL}api/branding/favicon`,
    });
    assert.ok(!JSON.stringify(links).includes(root));
    for (const [key, body, type] of [
      ['logoLight', Buffer.from(light), 'image/svg+xml'],
      ['logoDark', Buffer.from(dark), 'image/svg+xml'],
      ['favicon', icon, 'image/x-icon'],
    ]) {
      const response = await fetch(server.origin + links[key]);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), type);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
    }
    for (const name of ['unknown', '__proto__', 'private-light.svg', 'logo-light?path=/etc/passwd']) {
      const response = await fetch(`${server.url}/api/branding/${name}`);
      // A query cannot redirect a configured asset to another file.
      if (name.startsWith('logo-light?')) assert.equal(await response.text(), light);
      else {
        assert.equal(response.status, 404);
        assert.ok(!(await response.text()).includes(root));
      }
    }
    assert.ok(!(await (await fetch(server.url + '/login')).text()).includes(root));

    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    const context = await browser.newContext({ locale: 'en-US', colorScheme: 'light' });
    const page = await context.newPage();
    await page.route('**/api/registry/status', (route) =>
      route.fulfill({ json: { auth: true, authType: 'basic', user: '', deleteEnabled: false } }),
    );
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.url + '/login');
    const waitForLogo = (src) =>
      page.waitForFunction((expected) => {
        const image = document.querySelector('header img');
        return image?.getAttribute('src') === expected && image.complete && image.naturalWidth > 0;
      }, src);
    await waitForLogo(links.logoLight);
    await page.waitForFunction(
      (expected) => document.querySelector('link[rel="icon"]')?.getAttribute('href') === expected,
      links.favicon,
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitForLogo(links.logoDark);
    assert.deepEqual(errors, []);
    assert.ok(!(await page.content()).includes(root));
    await browser.close();
    browser = undefined;
    server.child.kill();
    await server.closed;
  }

  const invalid = await start({ NUXT_BRAND_LOGO_LIGHT_FILE: resolve(root, 'missing.svg') });
  await Promise.race([
    invalid.closed,
    delay(10000).then(() => {
      throw new Error('Invalid branding did not stop startup');
    }),
  ]);
  assert.notEqual(invalid.child.exitCode, 0);
  assert.match(invalid.output(), /Invalid NUXT_BRAND_LOGO_LIGHT_FILE/);
  console.log(
    'Branding integration passed: URL defaults, file bytes, MIME types, private paths, login logos, dark mode, favicon, deployment base URL, startup rejection',
  );
} finally {
  await browser?.close();
  for (const { child, closed } of children) {
    if (child.exitCode === null) child.kill();
    await closed;
  }
  await rm(root, { recursive: true, force: true });
}

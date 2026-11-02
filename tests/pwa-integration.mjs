import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'crateview-pwa-'));
const children = [];
let browser;
async function start(base, overrides = {}) {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      NUXT_APP_BASE_URL: base,
      NUXT_MONITORING_ENABLED: 'false',
      NUXT_AUTH_MODE: 'off',
      NUXT_PUBLIC_BRAND_NAME: 'PWA Test Registry',
      NUXT_PUBLIC_BRAND_DESCRIPTION: 'Synthetic test registry',
      NUXT_BRAND_PWA_ICON_192_FILE: '',
      NUXT_BRAND_PWA_ICON_512_FILE: '',
      NUXT_PUBLIC_BRAND_PWA_ICON_192: '/branding/pwa-192.png',
      NUXT_PUBLIC_BRAND_PWA_ICON_512: '/branding/pwa-512.png',
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
  const url = origin + base;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(url + 'manifest.webmanifest')).ok) return { origin, url, child, closed };
    } catch {
      /* Wait for server readiness. */
    }
    await delay(100);
  }
  throw new Error(`Production server did not start: ${output}`);
}
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  for (const base of ['/', '/registry/']) {
    const icon192 = join(root, 'private-192.png');
    const icon512 = join(root, 'private-512.png');
    await writeFile(icon192, await readFile('public/branding/pwa-192.png'));
    await writeFile(icon512, await readFile('public/branding/pwa-512.png'));
    for (const files of [false, true]) {
      const server = await start(
        base,
        files ? { NUXT_BRAND_PWA_ICON_192_FILE: icon192, NUXT_BRAND_PWA_ICON_512_FILE: icon512 } : {},
      );
      const response = await fetch(server.url + 'manifest.webmanifest');
      assert.match(response.headers.get('content-type'), /application\/manifest\+json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const manifest = await response.json();
      assert.equal(manifest.name, 'PWA Test Registry');
      assert.equal(manifest.description, 'Synthetic test registry');
      assert.equal(manifest.display, 'standalone');
      for (const key of ['id', 'start_url', 'scope']) assert.equal(manifest[key], base);
      assert.ok(!JSON.stringify(manifest).includes(root));
      for (const [index, size] of [192, 512].entries()) {
        const icon = manifest.icons[index];
        assert.equal(icon.sizes, `${size}x${size}`);
        assert.equal(icon.src, files ? `${base}api/branding/pwa-icon-${size}` : `${base}branding/pwa-${size}.png`);
        const image = await fetch(server.origin + icon.src);
        assert.equal(image.status, 200);
        assert.match(image.headers.get('content-type'), /image\/png/);
        const bytes = Buffer.from(await image.arrayBuffer());
        assert.equal(bytes.readUInt32BE(16), size);
        assert.equal(bytes.readUInt32BE(20), size);
        assert.deepEqual(bytes, await readFile(`public/branding/pwa-${size}.png`));
      }
      const context = await browser.newContext({ locale: 'en-US' });
      const page = await context.newPage();
      await page.route('**/api/registry/status', (route) =>
        route.fulfill({ json: { auth: true, authType: 'basic', user: '', deleteEnabled: false } }),
      );
      await page.goto(server.url + 'login');
      await page.waitForFunction(
        (expected) => document.querySelector('link[rel="manifest"]')?.getAttribute('href') === expected,
        base + 'manifest.webmanifest',
      );
      await page.waitForFunction(
        (expected) => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') === expected,
        manifest.icons[0].src,
      );
      const cdp = await context.newCDPSession(page);
      const detected = await cdp.send('Page.getAppManifest');
      assert.equal(detected.url, server.url + 'manifest.webmanifest');
      assert.deepEqual(detected.errors, []);
      await context.close();
      server.child.kill();
      await server.closed;
    }
  }
  const external = await start('/registry/', {
    NUXT_PUBLIC_BRAND_PWA_ICON_192: 'https://example.test/icon-192.png',
    NUXT_PUBLIC_BRAND_PWA_ICON_512: 'https://example.test/icon-512.png',
  });
  const manifest = await (await fetch(external.url + 'manifest.webmanifest')).json();
  assert.equal(manifest.icons[0].src, 'https://example.test/icon-192.png');
  assert.equal(manifest.icons[1].src, 'https://example.test/icon-512.png');
  external.child.kill();
  await external.closed;
  console.log(
    'PWA integration passed: runtime manifest, base paths, default/file/URL icons, browser manifest discovery, Apple touch icon',
  );
} finally {
  await browser?.close();
  for (const { child, closed } of children) {
    if (child.exitCode === null) child.kill();
    await closed;
  }
  await rm(root, { recursive: true, force: true });
}

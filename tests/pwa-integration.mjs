import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'crateview-pwa-'));
const children = [];
const upstream = createHttpServer((_request, response) => {
  response.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Basic realm="pwa-test-registry"',
    'Cache-Control': 'no-store',
  });
  response.end(
    JSON.stringify({ errors: [{ code: 'UNAUTHORIZED', message: 'Synthetic registry requires authentication' }] }),
  );
});
upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
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
      NUXT_REGISTRY_UPSTREAM: `http://127.0.0.1:${upstream.address().port}`,
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
async function verifyOffline(page, context, server, base, files) {
  const workerResponse = await fetch(server.url + 'sw.js');
  assert.match(workerResponse.headers.get('content-type'), /application\/javascript/);
  assert.equal(workerResponse.headers.get('cache-control'), 'no-cache');
  await page.waitForFunction(
    async () => Boolean((await navigator.serviceWorker.getRegistration())?.active),
    undefined,
    { timeout: 15000 },
  );
  const registration = await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    return { scope: worker.scope, script: worker.active.scriptURL };
  });
  assert.deepEqual(registration, { scope: server.url, script: server.url + 'sw.js' });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.addCookies([{ name: 'registry-ui-session', value: 'synthetic-invalid-session', url: server.url }]);
  for (const path of ['api/branding', 'api/account/users', 'v2/']) {
    const expected = await context.request.get(server.url + path, { headers: { Accept: 'application/json' } });
    const actual = await page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.text(),
      };
    }, server.url + path);
    assert.equal(actual.status, expected.status());
    assert.equal(actual.contentType, expected.headers()['content-type'] || null);
    if (path === 'api/branding' || path === 'v2/') assert.equal(actual.body, await expected.text());
    if (path === 'v2/') assert.equal(actual.status, 401);
    assert.ok(!actual.body.includes('You are offline'));
  }
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  const target = server.url + 'login?offline-test=1';
  for (const scenario of [
    { language: 'en', dir: 'ltr', title: 'You are offline', retry: 'Retry', width: 1280, height: 800, theme: 'light' },
    {
      language: 'de',
      dir: 'ltr',
      title: 'Du bist offline',
      retry: 'Erneut versuchen',
      width: 390,
      height: 844,
      theme: 'dark',
    },
    { language: 'ar', dir: 'rtl', title: 'أنت غير متصل بالإنترنت', width: 390, height: 844, theme: 'light' },
  ]) {
    // Test cookie precedence over the English browser locale, plus responsive themes and RTL.
    await context.addCookies([{ name: 'registry-ui-language', value: scenario.language, url: server.url }]);
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.theme });
    await context.setOffline(true);
    const response = await page.goto(target);
    assert.equal(response.status(), 503);
    await expect(page.locator('h1')).toHaveText(scenario.title);
    await expect(page.locator('html')).toHaveAttribute('lang', scenario.language);
    await expect(page.locator('html')).toHaveAttribute('dir', scenario.dir);
    await expect(page.locator('.brand')).toHaveText('PWA Test Registry');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
      scenario.theme === 'dark' ? 'rgb(24, 24, 27)' : 'rgb(250, 250, 250)',
    );
    const button = page.getByRole('button');
    if (scenario.retry) await expect(button).toHaveText(scenario.retry);
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    assert.equal(
      await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      }, server.url + 'api/branding'),
      true,
    );
    assert.deepEqual(await page.evaluate(() => caches.keys()), []);
    if (base === '/' && !files) {
      await mkdir('test-results/pwa', { recursive: true });
      await page.screenshot({
        path: `test-results/pwa/offline-${scenario.language}-${scenario.theme}.png`,
        fullPage: true,
      });
    }
    await context.setOffline(false);
    await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]);
    assert.equal(page.url(), target);
    await expect(page.locator('html')).toHaveAttribute('lang', scenario.language);
    await expect(page.locator('#retry')).toHaveCount(0);
  }
  // The offline document must also work when starting a new tab under an existing worker scope.
  await context.setOffline(true);
  const freshPage = await context.newPage();
  await freshPage.goto(target);
  await expect(freshPage.locator('h1')).toHaveText('أنت غير متصل بالإنترنت');
  await freshPage.close();
  // Unsupported/malformed cookie falls back to the browser locale, without application bundles.
  await context.addCookies([{ name: 'registry-ui-language', value: '%invalid', url: server.url }]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('You are offline');
  await context.setOffline(false);
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
      await verifyOffline(page, context, server, base, files);
      console.log(`PWA verified: base=${base}, file overrides=${files}`);
      await context.close();
      server.child.kill();
      await server.closed;
    }
  }
  await assert.rejects(
    start('/', { NUXT_BRAND_PWA_ICON_512_FILE: join(root, 'private-192.png') }),
    /Invalid NUXT_BRAND_PWA_ICON_512_FILE/,
  );
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
    'PWA integration passed: runtime manifest, base paths, default/file/URL icons, browser manifest discovery, Apple touch icon, worker scope, API passthrough, offline start/retry, RTL, themes, responsive layout, empty Cache Storage',
  );
} finally {
  await browser?.close();
  for (const { child, closed } of children) {
    if (child.exitCode === null) child.kill();
    await closed;
  }
  await new Promise((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
  await rm(root, { recursive: true, force: true });
}

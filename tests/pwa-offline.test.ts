import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createOfflineDocument, createPwaWorker, offlineMessages } from '../server/utils/pwa-offline';
import { supportedLocales } from '../shared/locales';

function worker(base = '/registry/', failure = false, status = 200) {
  let handler: (event: unknown) => void = () => {};
  const fetch = failure
    ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi.fn().mockResolvedValue(new Response('unchanged', { status }));
  runInNewContext(createPwaWorker(base, 'Test registry'), {
    self: {
      location: { origin: 'https://registry.test' },
      addEventListener: (_name: string, listener: typeof handler) => {
        handler = listener;
      },
    },
    URL,
    Response,
    fetch,
  });
  return { handler, fetch };
}
function event(path: string, method = 'GET', mode = 'navigate') {
  const respondWith = vi.fn();
  return { request: { url: `https://registry.test${path}`, method, mode }, respondWith };
}
describe('offline navigation boundary', () => {
  it.each([
    '/registry/api',
    '/registry/api/registry/catalog',
    '/registry/v2',
    '/registry/v2/private/manifests/latest',
    '/other/',
    '/registry-other/',
  ])('does not handle %s', (path) => {
    const { handler, fetch } = worker();
    const request = event(path);
    handler(request);
    expect(request.respondWith).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['POST', 'navigate'],
    ['GET', 'cors'],
    ['GET', 'same-origin'],
  ])('ignores %s %s requests', (method, mode) => {
    const request = event('/registry/explore', method, mode);
    worker().handler(request);
    expect(request.respondWith).not.toHaveBeenCalled();
  });
  it('ignores another origin', () => {
    const request = event('/registry/explore');
    request.request.url = 'https://other.test/registry/explore';
    worker().handler(request);
    expect(request.respondWith).not.toHaveBeenCalled();
  });
  it.each([200, 401, 403, 404, 500, 503])('preserves HTTP %i responses', async (status) => {
    const request = event('/registry/explore');
    worker('/registry/', false, status).handler(request);
    const response = await request.respondWith.mock.calls[0]![0];
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('unchanged');
  });
  it.each(['/', '/registry/'])('returns a standalone fallback only for network failure at %s', async (base) => {
    const request = event(base + 'image/test');
    worker(base, true).handler(request);
    const response = await request.respondWith.mock.calls[0]![0];
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('You are offline');
    expect(createPwaWorker(base, 'Test')).not.toMatch(/caches\.|skipWaiting|clients\.claim/);
  });
});
describe('offline document', () => {
  it('covers all supported languages and RTL metadata', () => {
    expect(Object.keys(offlineMessages)).toEqual(supportedLocales.map(({ code }) => code));
    for (const { code, dir } of supportedLocales) {
      expect(offlineMessages[code]).toMatchObject({
        dir,
        title: expect.any(String),
        description: expect.any(String),
        retry: expect.any(String),
      });
      expect(offlineMessages[code]!.title).not.toBe('');
    }
  });
  it('escapes runtime branding and does not request external assets', () => {
    const document = createOfflineDocument('<script>alert("secret")</script>');
    expect(document).toContain('&lt;script&gt;');
    expect(document).not.toContain('<script>alert');
    expect(document).not.toMatch(/<link|<img|<script src=/);
  });
});

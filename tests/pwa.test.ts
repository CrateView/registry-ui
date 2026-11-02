import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPwaManifest, validatePwaPng } from '../server/utils/pwa';
import { pwaAssetUrl } from '../shared/pwa';

const branding = {
  logoLight: '',
  logoDark: '',
  favicon: '',
  pwaIcon192: '/branding/pwa-192.png',
  pwaIcon512: '/branding/pwa-512.png',
};
describe('PWA install metadata', () => {
  it.each(['/', '/registry/'])('respects deployment base %s', (base) => {
    const manifest = createPwaManifest(base, 'Custom registry', 'Private images', branding);
    expect(manifest).toMatchObject({
      id: base,
      start_url: base,
      scope: base,
      name: 'Custom registry',
      description: 'Private images',
      display: 'standalone',
    });
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      `${base}branding/pwa-192.png`,
      `${base}branding/pwa-512.png`,
    ]);
  });
  it('preserves external URLs and already scoped file routes', () => {
    expect(pwaAssetUrl('https://example.test/icon.png', '/registry/')).toBe('https://example.test/icon.png');
    expect(pwaAssetUrl('/registry/api/branding/pwa-icon-192', '/registry/')).toBe(
      '/registry/api/branding/pwa-icon-192',
    );
  });
  it.each([192, 512])('accepts the %i-pixel default PNG', (size) => {
    expect(() => validatePwaPng(readFileSync(`public/branding/pwa-${size}.png`), size)).not.toThrow();
  });
  it('rejects non-PNG, truncated, corrupted, and incorrectly sized images', () => {
    const valid = readFileSync('public/branding/pwa-192.png');
    const corrupt = Buffer.from(valid);
    corrupt[100] = corrupt[100]! ^ 1;
    for (const body of [Buffer.from('<svg/>'), valid.subarray(0, -1), corrupt]) {
      expect(() => validatePwaPng(body, 192)).toThrow();
    }
    expect(() => validatePwaPng(valid, 512)).toThrow();
  });
});

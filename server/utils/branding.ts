import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { Branding } from '../../shared/branding';
import { validatePwaPng } from './pwa';

interface BrandingConfig {
  brandLogoLightFile: string;
  brandLogoDarkFile: string;
  brandFaviconFile: string;
  brandPwaIcon_192File: string;
  brandPwaIcon_512File: string;
  public: {
    brandLogoLight: string;
    brandLogoDark: string;
    brandFavicon: string;
    brandPwaIcon_192: string;
    brandPwaIcon_512: string;
  };
  app: { baseURL: string };
}

const mediaTypes: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};
const settings = [
  ['logo-light', 'logoLight', 'brandLogoLightFile', 'brandLogoLight', 'NUXT_BRAND_LOGO_LIGHT_FILE'],
  ['logo-dark', 'logoDark', 'brandLogoDarkFile', 'brandLogoDark', 'NUXT_BRAND_LOGO_DARK_FILE'],
  ['favicon', 'favicon', 'brandFaviconFile', 'brandFavicon', 'NUXT_BRAND_FAVICON_FILE'],
  ['pwa-icon-192', 'pwaIcon192', 'brandPwaIcon_192File', 'brandPwaIcon_192', 'NUXT_BRAND_PWA_ICON_192_FILE'],
  ['pwa-icon-512', 'pwaIcon512', 'brandPwaIcon_512File', 'brandPwaIcon_512', 'NUXT_BRAND_PWA_ICON_512_FILE'],
] as const;

export function loadBranding(config: BrandingConfig, cwd = process.cwd()) {
  const assets = new Map<string, { body: Buffer; contentType: string }>();
  const links = {} as Branding;
  const baseURL = config.app.baseURL.replace(/\/$/, '');
  for (const [asset, key, fileKey, urlKey, variable] of settings) {
    links[key] = config.public[urlKey];
    const file = config[fileKey];
    if (!file) continue;
    try {
      const path = resolve(cwd, file);
      const contentType = mediaTypes[extname(path).toLowerCase()];
      if (!contentType) throw new Error('Unsupported image extension');
      if (!statSync(path).isFile()) throw new Error('Expected a regular file');
      const body = readFileSync(path);
      if (key === 'pwaIcon192' || key === 'pwaIcon512') {
        validatePwaPng(body, key === 'pwaIcon192' ? 192 : 512);
        if (contentType !== 'image/png') throw new Error('Expected PNG extension');
      }
      if (!body.length) throw new Error('Empty image file');
      assets.set(asset, { body, contentType });
      links[key] = `${baseURL}/api/branding/${asset}`;
    } catch (error) {
      const expected =
        key === 'pwaIcon192' || key === 'pwaIcon512'
          ? `a readable ${key === 'pwaIcon192' ? 192 : 512}x${key === 'pwaIcon192' ? 192 : 512} PNG file`
          : 'a readable, nonempty SVG, PNG, JPEG, WebP, GIF or ICO file';
      throw new Error(`Invalid ${variable}: expected ${expected}`, {
        cause: error,
      });
    }
  }
  return { links, assets };
}

let branding: ReturnType<typeof loadBranding> | undefined;

export function initializeBranding(config: BrandingConfig) {
  branding = loadBranding(config);
}

export function getBranding() {
  if (!branding) throw new Error('Branding has not been initialized');
  return branding;
}

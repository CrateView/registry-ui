import { getBranding } from '../utils/branding';
import { createPwaManifest } from '../utils/pwa';

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  setHeader(event, 'Content-Type', 'application/manifest+json');
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  return createPwaManifest(
    config.app.baseURL,
    config.public.brandName,
    config.public.brandDescription,
    getBranding().links,
  );
});

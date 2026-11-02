import { getBranding } from '../../utils/branding';

export default defineEventHandler((event) => {
  const asset = getBranding().assets.get(getRouterParam(event, 'asset') || '');
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Branding asset not found' });
  setHeader(event, 'Content-Type', asset.contentType);
  setHeader(event, 'Cache-Control', 'no-cache');
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  return asset.body;
});

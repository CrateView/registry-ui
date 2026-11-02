import { createPwaWorker } from '../utils/pwa-offline';

export default defineEventHandler((event) => {
  if (import.meta.dev) throw createError({ statusCode: 404 });
  const config = useRuntimeConfig(event);
  setHeader(event, 'Content-Type', 'application/javascript; charset=utf-8');
  setHeader(event, 'Cache-Control', 'no-cache');
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  return createPwaWorker(config.app.baseURL, config.public.brandName);
});

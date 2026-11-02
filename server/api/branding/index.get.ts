import { getBranding } from '../../utils/branding';

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store');
  return getBranding().links;
});

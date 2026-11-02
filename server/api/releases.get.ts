import { createReleaseLoader } from '../utils/releases';

const load = createReleaseLoader();
export default defineEventHandler(async () => {
  try {
    return { releases: await load() };
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Releases unavailable' });
  }
});

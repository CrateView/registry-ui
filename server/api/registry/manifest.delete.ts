import { digestQuerySchema } from '../../../shared/validation';
import { referencePath, registryFetch, repositoryPath, sameOrigin } from '../../utils/registry';
import { validated } from '../../utils/validation';

export default defineEventHandler(async (event) => {
  sameOrigin(event);
  const enabled = useRuntimeConfig(event).registryDeleteEnabled;
  if (enabled !== true && String(enabled) !== 'true')
    throw createError({ statusCode: 403, statusMessage: 'Manifest deletion is disabled' });
  const { name, digest } = validated(digestQuerySchema, getQuery(event));
  await registryFetch(event, `/v2/${repositoryPath(name)}/manifests/${referencePath(digest)}`, {
    method: 'DELETE',
  });
  return { ok: true };
});

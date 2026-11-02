import { documentQuerySchema } from '../../../shared/validation';
import { referencePath, registryFetch, repositoryPath } from '../../utils/registry';
import { validated } from '../../utils/validation';

export default defineEventHandler(async (event) => {
  const { name, reference, kind } = validated(documentQuerySchema, getQuery(event));
  const response = await registryFetch(
    event,
    `/v2/${repositoryPath(name)}/${kind === 'config' ? 'blobs' : 'manifests'}/${referencePath(reference)}`,
  );
  return await response.json();
});

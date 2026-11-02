import { documentQuerySchema } from '../../../shared/validation'
import { validated } from '../../utils/validation'
import { registryFetch, repositoryPath, referencePath } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  const { name, reference, kind } = validated(documentQuerySchema, getQuery(event))
  const response = await registryFetch(
    event,
    `/v2/${repositoryPath(name)}/${kind === 'config' ? 'blobs' : 'manifests'}/${referencePath(reference)}`,
  )
  return await response.json()
})

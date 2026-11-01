import { registryFetch, repositoryPath, referencePath } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const name = String(query.name || '')
  const reference = String(query.reference || '')
  if (!['manifest', 'config'].includes(String(query.kind)))
    throw createError({ statusCode: 400, statusMessage: 'Invalid document kind' })
  if (query.kind === 'config' && !/^sha256:[a-f0-9]{64}$/.test(reference))
    throw createError({ statusCode: 400, statusMessage: 'Config digest required' })
  const response = await registryFetch(
    event,
    `/v2/${repositoryPath(name)}/${query.kind === 'config' ? 'blobs' : 'manifests'}/${referencePath(reference)}`,
  )
  return await response.json()
})

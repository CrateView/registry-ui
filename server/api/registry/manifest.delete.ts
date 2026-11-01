import { sameOrigin, registryFetch, repositoryPath, referencePath } from '../../utils/registry'
export default defineEventHandler(async (event) => {
  sameOrigin(event)
  const enabled = useRuntimeConfig(event).registryDeleteEnabled
  if (enabled !== true && String(enabled) !== 'true')
    throw createError({ statusCode: 403, statusMessage: 'Manifest deletion is disabled' })
  const name = String(getQuery(event).name || '')
  const digest = String(getQuery(event).digest || '')
  if (!/^sha256:[a-f0-9]{64}$/.test(digest))
    throw createError({ statusCode: 400, statusMessage: 'Manifest digest required' })
  await registryFetch(event, `/v2/${repositoryPath(name)}/manifests/${referencePath(digest)}`, {
    method: 'DELETE',
  })
  return { ok: true }
})
